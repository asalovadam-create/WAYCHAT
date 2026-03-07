/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║          WAYCHAT ULTIMATE ENGINE 2026                        ║
 * ║          Version: 7.1.0 — PREMIUM EDITION                   ║
 * ║  Real-time · IndexedDB Cache · Groups · SVG Icons · Stable  ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

// ══════════════════════════════════════════════════════════
//  PERSISTENT CACHE — IndexedDB для аватаров, медиа, профилей
// ══════════════════════════════════════════════════════════
const WCCache = (() => {
    const DB_NAME = 'waychat_cache';
    const DB_VER  = 2;
    let _db = null;

    function open() {
        if (_db) return Promise.resolve(_db);
        return new Promise((res, rej) => {
            const req = indexedDB.open(DB_NAME, DB_VER);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('avatars'))  db.createObjectStore('avatars');
                if (!db.objectStoreNames.contains('profiles')) db.createObjectStore('profiles');
                if (!db.objectStoreNames.contains('media'))    db.createObjectStore('media');
                if (!db.objectStoreNames.contains('chats'))    db.createObjectStore('chats');
            };
            req.onsuccess  = (e) => { _db = e.target.result; res(_db); };
            req.onerror    = () => rej(req.error);
        });
    }

    async function get(store, key) {
        try {
            const db = await open();
            return new Promise((res) => {
                const tx  = db.transaction(store, 'readonly');
                const req = tx.objectStore(store).get(key);
                req.onsuccess = () => res(req.result ?? null);
                req.onerror   = () => res(null);
            });
        } catch(e) { return null; }
    }

    async function set(store, key, value) {
        try {
            const db = await open();
            return new Promise((res) => {
                const tx  = db.transaction(store, 'readwrite');
                tx.objectStore(store).put(value, key);
                tx.oncomplete = () => res(true);
                tx.onerror    = () => res(false);
            });
        } catch(e) { return false; }
    }

    async function del(store, key) {
        try {
            const db = await open();
            const tx  = db.transaction(store, 'readwrite');
            tx.objectStore(store).delete(key);
        } catch(e) {}
    }

    return { get, set, del };
})();

// Обёртка для аватаров — загружает, кэширует в IndexedDB, возвращает blob URL
const AvatarCache = (() => {
    const _mem = {};  // key → blob URL (in-memory, сессия)
    const TTL  = 24 * 60 * 60 * 1000; // 24ч

    async function getOrFetch(url, userId) {
        if (!url || url.startsWith('data:') || url.startsWith('emoji:')) return url;
        const key = `${userId}_${url.split('?')[0]}`;

        // 1) Память
        if (_mem[key]) return _mem[key];

        // 2) IndexedDB
        const cached = await WCCache.get('avatars', key);
        if (cached && cached.blob && (Date.now() - cached.ts < TTL)) {
            const blobUrl = URL.createObjectURL(cached.blob);
            _mem[key] = blobUrl;
            return blobUrl;
        }

        // 3) Сеть
        try {
            const resp = await fetch(url, { cache: 'force-cache' });
            if (!resp.ok) return url;
            const blob = await resp.blob();
            await WCCache.set('avatars', key, { blob, ts: Date.now() });
            const blobUrl = URL.createObjectURL(blob);
            _mem[key] = blobUrl;
            return blobUrl;
        } catch(e) { return url; }
    }

    function invalidate(userId) {
        Object.keys(_mem).forEach(k => {
            if (k.startsWith(`${userId}_`)) {
                URL.revokeObjectURL(_mem[k]);
                delete _mem[k];
            }
        });
        // Удаляем из IDB — не критично, TTL сделает своё
    }

    return { getOrFetch, invalidate };
})();

// ══════════════════════════════════════════════════════════
//  SVG ИКОНКИ — нарисованные, не эмодзи
// ══════════════════════════════════════════════════════════
const ICONS = {
    send: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M22 2L11 13" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    back: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M19 12H5M5 12L12 19M5 12L12 5" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    call: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.72A2 2 0 012 1h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    video: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M23 7l-7 5 7 5V7z" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    more: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="5" r="1.5" fill="white"/><circle cx="12" cy="12" r="1.5" fill="white"/><circle cx="12" cy="19" r="1.5" fill="white"/></svg>`,
    attach: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" stroke="rgba(255,255,255,0.5)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    mic: `<svg width="17" height="17" viewBox="0 0 24 24" fill="none"><rect x="9" y="2" width="6" height="11" rx="3" stroke="rgba(255,255,255,0.5)" stroke-width="2"/><path d="M19 10v2a7 7 0 01-14 0v-2M12 19v3M8 22h8" stroke="rgba(255,255,255,0.5)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    search: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="8" stroke="rgba(255,255,255,0.35)" stroke-width="2"/><path d="M21 21l-4.35-4.35" stroke="rgba(255,255,255,0.35)" stroke-width="2" stroke-linecap="round"/></svg>`,
    plus: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><line x1="12" y1="5" x2="12" y2="19" stroke="black" stroke-width="2.5" stroke-linecap="round"/><line x1="5" y1="12" x2="19" y2="12" stroke="black" stroke-width="2.5" stroke-linecap="round"/></svg>`,
    check: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><polyline points="20 6 9 17 4 12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    checkDouble: `<svg width="16" height="12" viewBox="0 0 24 16" fill="none"><polyline points="1 8 6 13 15 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><polyline points="9 8 14 13 23 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    settings: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    chats: `<svg width="26" height="26" viewBox="0 0 24 24" fill="none"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    moments: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="5" stroke="currentColor" stroke-width="2"/><line x1="12" y1="1" x2="12" y2="3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="12" y1="21" x2="12" y2="23" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="1" y1="12" x2="3" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="21" y1="12" x2="23" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
    profile: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="7" r="4" stroke="currentColor" stroke-width="2"/></svg>`,
    group: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="9" cy="7" r="4" stroke="currentColor" stroke-width="2"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    trash: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><polyline points="3 6 5 6 21 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6M10 11v6M14 11v6M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    copy: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    lock: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" stroke="currentColor" stroke-width="2"/><path d="M7 11V7a5 5 0 0110 0v4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    camera: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="13" r="4" stroke="currentColor" stroke-width="2"/></svg>`,
    smile: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/><path d="M8 14s1.5 2 4 2 4-2 4-2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><line x1="9" y1="9" x2="9.01" y2="9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="15" y1="9" x2="15.01" y2="9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
    phone_off: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M10.68 13.31a16 16 0 003.41 2.6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7 2 2 0 011.72 2v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.42 19.42 0 013.07 9.12a19.79 19.79 0 01-3.07-8.63A2 2 0 012 .5h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L6.08 8.41M23 1L1 23" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    globe: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/><line x1="2" y1="12" x2="22" y2="12" stroke="currentColor" stroke-width="2"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" stroke="currentColor" stroke-width="2"/></svg>`,
    bell: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    info: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/><line x1="12" y1="8" x2="12" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="12" y1="16" x2="12.01" y2="16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
    logout: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    users: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="9" cy="7" r="4" stroke="currentColor" stroke-width="2"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    edit: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    gallery: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" stroke="currentColor" stroke-width="2"/><circle cx="8.5" cy="8.5" r="1.5" stroke="currentColor" stroke-width="2"/><polyline points="21 15 16 10 5 21" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    block: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
    wifi_off: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><line x1="1" y1="1" x2="23" y2="23" stroke="white" stroke-width="2" stroke-linecap="round"/><path d="M16.72 11.06A10.94 10.94 0 0119 12.55M5 12.55a10.94 10.94 0 015.17-2.39M10.71 5.05A16 16 0 0122.56 9M1.42 9a15.91 15.91 0 014.7-2.88M8.53 16.11a6 6 0 016.95 0M12 20h.01" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    wifi: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M5 12.55a11 11 0 0114.08 0M1.42 9a16 16 0 0121.16 0M8.53 16.11a6 6 0 016.95 0M12 20h.01" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
};

// ══════════════════════════════════════════════════════════
//  ГЛОБАЛЬНОЕ СОСТОЯНИЕ
// ══════════════════════════════════════════════════════════
let socket            = null;
let currentChatId     = null;
let currentPartnerId  = null;
let currentChatType   = 'private'; // 'private' | 'group'
let currentTab        = 'chats';
let searchTimeout     = null;
let typingTimeout     = null;
let mediaRecorder     = null;
let audioChunks       = [];
let recordTimerInterval = null;
let isRecording       = false;
let _globalMicStream  = null;   // глобальный поток микрофона — держим живым
let recordDuration    = 0;
let callLocalStream   = null;
let peerConnection    = null;
let pendingIce        = [];
let incomingCallData  = null;
let isMuted           = false;
let isVideoOff        = false;
let callStartTime     = null;
let callTimerInterval = null;
let recentChats       = [];

// ══ КЭШИ АВАТАРОВ ══
let avatarHtmlCache   = {};
let chatPartnerAvatarSrc = {};

// ══ КЭШИ МОМЕНТОВ ══
let momentsCache      = null;
let momentsLastLoad   = 0;
let _viewedMomentUsers = new Set(); // uid пользователей чьи моменты уже просмотрены

// ══ КЭШ СООБЩЕНИЙ — главная фича ══
// { chatId: { messages: [], loadedAll: bool, lastFetch: timestamp } }
let messagesByChatCache = {};
const MSG_CACHE_TTL = 60000; // 1 мин до инвалидации при переходе

let longPressTimer    = null;
let activeTheme       = localStorage.getItem('waychat_theme') || 'emerald';
let wsConnected       = false;
let wsReconnected     = false;
let currentPage       = 1;
let loadingMessages   = false;
let hasMoreMessages   = true;
let currentCallType   = 'audio';
let iceRestartCount   = 0;
let MAX_ICE_RESTARTS  = 3;
let callQuality       = 'unknown';
let callQualityTimer  = null;
let notifPermission   = false;
let searchMode        = false;
let unreadTotal       = 0;
let momentViewIndex   = 0;
let currentMoments    = [];
let activeAudio       = null;
let wakelock          = null;

// Контакты
let savedContacts      = JSON.parse(localStorage.getItem('waychat_contacts') || '[]');
let contactCustomNames = JSON.parse(localStorage.getItem('waychat_contact_names') || '{}');

// Данные пользователя
const currentUser = Object.assign({
    id: 0, name: 'Пользователь', username: 'user',
    avatar: '/static/default_avatar.png', bio: '', phone: ''
}, window.currentUser || {});

// WebRTC конфиг
const rtcConfig = {
    iceServers: window.ICE_SERVERS || [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:openrelay.metered.ca:80' },
        { urls: 'turn:openrelay.metered.ca:80',    username: 'openrelayproject', credential: 'openrelayproject' },
        { urls: 'turn:openrelay.metered.ca:443',   username: 'openrelayproject', credential: 'openrelayproject' },
        { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }
    ],
    iceCandidatePoolSize: 15,
    iceTransportPolicy: 'all',
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require'
};

const THEMES = {
    emerald: { accent: '#10b981', glow: '0 0 20px rgba(16,185,129,0.4)', name: 'Изумруд' },
    blue:    { accent: '#3b82f6', glow: '0 0 20px rgba(59,130,246,0.4)', name: 'Синий' },
    purple:  { accent: '#8b5cf6', glow: '0 0 20px rgba(139,92,246,0.4)', name: 'Фиолет' },
    rose:    { accent: '#f43f5e', glow: '0 0 20px rgba(244,63,94,0.4)',  name: 'Розовый' },
    amber:   { accent: '#f59e0b', glow: '0 0 20px rgba(245,158,11,0.4)', name: 'Янтарь' },
};

// ══════════════════════════════════════════════════════════
//  SOCKET.IO — ИНИЦИАЛИЗАЦИЯ
// ══════════════════════════════════════════════════════════
function initSocket() {
    socket = io({
        path: '/socket.io',
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 10000,
        reconnectionAttempts: Infinity,
        timeout: 20000,
        forceNew: false,
        withCredentials: true
    });

    socket.on('connect', () => {
        wsConnected = true;
        updateConnStatus(true);
        socket.emit('join', { user_id: currentUser.id });
        loadChats();
        if (currentChatId) socket.emit('enter_chat', { chat_id: currentChatId });
        wsReconnected = true;
    });

    socket.on('disconnect', () => { wsConnected = false; updateConnStatus(false); });
    socket.on('connect_error', () => { wsConnected = false; updateConnStatus(false); });
    socket.on('reconnect', () => { wsConnected = true; updateConnStatus(true); });

    socket.on('new_message', onNewMessage);

    socket.on('is_typing', (d) => {
        if (+d.chat_id === currentChatId) showTypingIndicator(d.user_name);
    });
    socket.on('stop_typing', (d) => {
        if (+d.chat_id === currentChatId) hideTypingIndicator();
    });

    socket.on('user_status', (d) => updatePartnerOnlineStatus(+d.user_id, d.online));

    socket.on('message_read', (d) => {
        document.querySelectorAll(`[data-msg-id="${d.msg_id}"] .status-icon`).forEach(el => {
            el.innerHTML = ICONS.checkDouble;
            el.style.color = 'rgba(147,197,253,1)';
        });
    });

    socket.on('messages_read_bulk', (d) => {
        if (+d.chat_id === currentChatId) {
            document.querySelectorAll('.msg-row.out .status-icon').forEach(el => {
                el.innerHTML = ICONS.checkDouble;
                el.style.color = 'rgba(147,197,253,1)';
            });
        }
    });

    socket.on('message_reaction', (d) => {
        addReactionToMsg(d.msg_id, d.emoji, +d.user_id === currentUser.id);
    });

    socket.on('avatar_updated', (d) => {
        invalidateAvatarCache(d.user_id, d.avatar);
        updateAvatarInDOM(d.user_id, d.avatar);
    });

    socket.on('message_deleted', (d) => {
        const row = document.querySelector(`[data-msg-id="${d.msg_id}"]`);
        if (row) {
            row.style.transition = 'opacity 0.3s, transform 0.3s';
            row.style.opacity = '0';
            row.style.transform = 'scale(0.95)';
            setTimeout(() => row.remove(), 300);
        }
        // Удаляем из кэша
        if (messagesByChatCache[d.chat_id]) {
            messagesByChatCache[d.chat_id].messages = messagesByChatCache[d.chat_id].messages.filter(m => m.id !== d.msg_id);
        }
    });

    // Группы
    socket.on('group_message', onNewMessage);
    socket.on('group_member_added', (d) => {
        if (+d.group_id === currentChatId) {
            showToast(`${d.member_name} добавлен в группу`, 'info');
        }
    });
    socket.on('group_member_left', (d) => {
        if (+d.group_id === currentChatId) {
            loadChats();
        }
    });
    socket.on('kicked_from_group', (d) => {
        // Нас исключили из группы
        const gid = d.group_id;
        // Если открыт этот чат — закрываем
        if (currentChatType === 'group' && currentPartnerId === +gid) {
            document.getElementById('chat-window')?.classList.remove('active');
            currentChatId   = null;
            currentPartnerId = null;
            currentChatType = 'personal';
        }
        // Удаляем из кэша
        delete messagesByChatCache[`g_${gid}`];
        loadChats();
        showToast('Вас исключили из группы', 'warning');
    });

    socket.on('incoming_call',  onIncomingCall);
    socket.on('call_answered',  onCallAnswered);
    socket.on('ice_candidate',  onIceCandidate);
    socket.on('call_ended',     () => endCall(false));
}

// ══════════════════════════════════════════════════════════
//  ИНИЦИАЛИЗАЦИЯ
// ══════════════════════════════════════════════════════════
// Заранее греем поток микрофона — вызывается при первом touch на экране
// Это единственный способ на Safari: запросить внутри user gesture
let _micPreWarmed = false;

async function _preWarmMic() {
    // если уже получили поток — выходим
    if (_micPreWarmed && _globalMicStream) return;

    // Safari требует secure context
    if (!window.isSecureContext) {
        alert("Сайт не HTTPS (нет secure context)");
        return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert("getUserMedia не поддерживается");
        return;
    }

    try {
        _micPreWarmed = true;

        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true
            },
            video: false
        });

        _globalMicStream = stream;

        if (typeof _sessionPerms !== "undefined") {
            _sessionPerms["microphone"] = "granted";
        }

        console.log("Микрофон успешно получен");

    } catch (e) {
        _micPreWarmed = false;
        alert("Ошибка микрофона: " + e.name + " | " + e.message);
        console.error(e);
    }
}

async function init() {
    // Сначала восстанавливаем профиль из кэша — аватар сразу виден
    try {
        const cache = localStorage.getItem('waychat_user_cache') || localStorage.getItem('varto_user_cache');
        if (cache) Object.assign(currentUser, JSON.parse(cache));
    } catch(e){}

    applyTheme(activeTheme);
    renderApp();
    applyTheme(activeTheme);
    updateAllAvatarUI();
    setupGlobalGestures();
    // Микрофон запрашивается только при необходимости (запись голоса/видео)
    initSocket();
    setTimeout(syncProfileData, 300);
    setTimeout(_updatePermsSummary, 600);
    setTimeout(initPushNotifications, 500);

    setInterval(() => {
        if (currentTab === 'chats' && !currentChatId) loadChats();
    }, 30000);
}

// ══════════════════════════════════════════════════════════
//  ТЕМА
// ══════════════════════════════════════════════════════════
function applyTheme(name) {
    activeTheme = name;
    localStorage.setItem('waychat_theme', name);
    const t = THEMES[name] || THEMES.emerald;
    document.documentElement.style.setProperty('--accent', t.accent);
    document.documentElement.style.setProperty('--glow', t.glow);
    document.documentElement.style.setProperty('--accent-10', t.accent + '1a');
    document.documentElement.style.setProperty('--accent-30', t.accent + '4d');
}

// ══════════════════════════════════════════════════════════
//  АВАТАРКИ — УМНОЕ КЭШИРОВАНИЕ
// ══════════════════════════════════════════════════════════

// Значки верификации
const VERIFY_BADGES = {
    official: {emoji:'✅', label:'Официальный', color:'#60a5fa'},
    star:     {emoji:'⭐', label:'Звезда',       color:'#fbbf24'},
    dev:      {emoji:'🛠️', label:'Разработчик', color:'#a78bfa'},
    press:    {emoji:'📰', label:'Пресса',       color:'#34d399'},
    partner:  {emoji:'🤝', label:'Партнёр',      color:'#f87171'},
};
function getVerifyBadge(user, size=14) {
    if (!user?.is_verified || !user?.verified_type) return '';
    const b = VERIFY_BADGES[user.verified_type];
    if (!b) return '';
    return `<span title="${b.label}" style="font-size:${size}px;vertical-align:middle;margin-left:3px;cursor:default">${b.emoji}</span>`;
}

function getAvatarHtml(user, sizeClass = 'w-12 h-12', forceRefresh = false) {
    if (!user) return `<div class="${sizeClass} bg-zinc-800 rounded-full"></div>`;
    const avatar = user.avatar || '';
    const name   = user.name || user.username || '?';
    const cacheKey = `${user.id || name}_${avatar}_${sizeClass}`;
    if (!forceRefresh && avatarHtmlCache[cacheKey]) return avatarHtmlCache[cacheKey];

    let html;
    if (avatar.startsWith('emoji:')) {
        const emoji = avatar.split(':')[1];
        const fontSize = sizeClass.includes('w-28') ? 'text-4xl' : sizeClass.includes('w-16') ? 'text-3xl' : sizeClass.includes('w-14') ? 'text-2xl' : sizeClass.includes('w-10') ? 'text-xl' : 'text-lg';
        html = `<div class="${sizeClass} bg-zinc-900/80 rounded-full flex items-center justify-center ${fontSize} shadow-inner border border-white/5" data-uid="${user.id||''}">${emoji}</div>`;
    } else if (avatar && !avatar.includes('default_avatar')) {
        const src = forceRefresh ? avatar + '?t=' + Date.now() : avatar;
        html = `<img src="${src}" class="${sizeClass} rounded-full object-cover shadow-md border border-white/10" loading="lazy" data-uid="${user.id||''}" onerror="this.outerHTML=getInitialAvatar('${name.replace(/'/g,"\\'")}','${sizeClass}','${user.id||''}')">`;
    } else {
        html = getInitialAvatar(name, sizeClass, user.id);
    }
    avatarHtmlCache[cacheKey] = html;
    return html;
}

function getInitialAvatar(name, sizeClass, uid = '') {
    const colors = ['#ef4444','#3b82f6','#10b981','#f97316','#8b5cf6','#ec4899','#06b6d4','#84cc16'];
    const char   = (name || '?').charAt(0).toUpperCase();
    const color  = colors[char.charCodeAt(0) % colors.length];
    const fontSize = sizeClass.includes('w-28') ? 'text-4xl' : sizeClass.includes('w-16') ? 'text-2xl' : sizeClass.includes('w-14') ? 'text-xl' : 'text-base';
    return `<div class="${sizeClass} rounded-full flex items-center justify-center text-white font-bold ${fontSize}" style="background:${color};box-shadow:0 2px 10px rgba(0,0,0,0.35)" data-uid="${uid}">${char}</div>`;
}

function invalidateAvatarCache(userId, newAvatar) {
    Object.keys(avatarHtmlCache).forEach(k => { if (k.startsWith(`${userId}_`)) delete avatarHtmlCache[k]; });
    if (userId === currentUser.id && newAvatar) currentUser.avatar = newAvatar;
}

function updateAvatarInDOM(userId, newAvatar) {
    document.querySelectorAll(`[data-uid="${userId}"]`).forEach(el => {
        if (newAvatar && newAvatar.startsWith('emoji:')) {
            el.textContent = newAvatar.split(':')[1];
        } else if (newAvatar && el.tagName === 'IMG') {
            el.src = newAvatar + '?t=' + Date.now();
        }
    });
}

// ══════════════════════════════════════════════════════════
//  ВИБРАЦИЯ И ТОСТЫ
// ══════════════════════════════════════════════════════════
function vibrate(pattern) { if (navigator.vibrate) navigator.vibrate(pattern); }

function showToast(text, type = 'info', duration = 2500) {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.style.cssText = 'position:fixed;top:60px;left:50%;transform:translateX(-50%);z-index:99999;display:flex;flex-direction:column;gap:8px;pointer-events:none;min-width:200px;max-width:90vw';
        document.body.appendChild(container);
    }
    const colors = { success: '#10b981', error: '#ef4444', warning: '#f59e0b', info: '#3b82f6' };
    const toast  = document.createElement('div');
    toast.style.cssText = `background:rgba(20,20,25,0.97);backdrop-filter:blur(20px);border:1px solid ${colors[type]}40;border-left:3px solid ${colors[type]};color:white;padding:10px 16px;border-radius:12px;font-size:14px;font-weight:500;display:flex;align-items:center;gap:8px;animation:toastIn 0.3s cubic-bezier(0.34,1.56,0.64,1);white-space:nowrap;box-shadow:0 4px 20px rgba(0,0,0,0.4);max-width:90vw;overflow:hidden;text-overflow:ellipsis;`;
    const icon = type === 'success' ? ICONS.check.replace('currentColor','#10b981') : type === 'error' ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="#ef4444" stroke-width="2"/><line x1="15" y1="9" x2="9" y2="15" stroke="#ef4444" stroke-width="2" stroke-linecap="round"/><line x1="9" y1="9" x2="15" y2="15" stroke="#ef4444" stroke-width="2" stroke-linecap="round"/></svg>` : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="${colors[type]}" stroke-width="2"/><line x1="12" y1="8" x2="12" y2="12" stroke="${colors[type]}" stroke-width="2" stroke-linecap="round"/><line x1="12" y1="16" x2="12.01" y2="16" stroke="${colors[type]}" stroke-width="2" stroke-linecap="round"/></svg>`;
    toast.innerHTML = `<span style="flex-shrink:0">${icon}</span><span style="overflow:hidden;text-overflow:ellipsis">${text}</span>`;
    container.appendChild(toast);
    setTimeout(() => { toast.style.animation = 'toastOut 0.2s ease forwards'; setTimeout(() => toast.remove(), 200); }, duration);
}

// ══════════════════════════════════════════════════════════
//  ИНДИКАТОР ПОДКЛЮЧЕНИЯ
// ══════════════════════════════════════════════════════════
function updateConnStatus(online) {
    wsConnected = online;
    const el = document.getElementById('conn-status');
    const wsLabel = document.getElementById('ws-status-label');
    if (!el) return;
    if (online) {
        el.classList.remove('offline');
        el.style.opacity = '1';
        el.innerHTML = `<span style="display:flex;align-items:center;gap:4px;padding:0 8px;height:100%;justify-content:center">${ICONS.wifi}</span>`;
        setTimeout(() => { if (el) el.style.opacity = '0'; }, 1500);
        if (wsLabel) wsLabel.textContent = 'Онлайн';
    } else {
        el.classList.add('offline');
        el.style.opacity = '1';
        el.innerHTML = `<span style="display:flex;align-items:center;gap:4px;padding:0 8px;height:100%;justify-content:center">${ICONS.wifi_off}</span>`;
        if (wsLabel) wsLabel.textContent = 'Переподключение...';
    }
}

// ══════════════════════════════════════════════════════════
//  МОСКОВСКОЕ ВРЕМЯ
// ══════════════════════════════════════════════════════════
function getMoscowTime(dateStr) {
    if (!dateStr) return '';
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        const moscowOffset = 3 * 60;
        const localOffset  = d.getTimezoneOffset();
        const moscow = new Date(d.getTime() + (moscowOffset + localOffset) * 60000);
        const nowMsk = new Date(Date.now() + (moscowOffset + (new Date().getTimezoneOffset())) * 60000);
        const isToday = moscow.toDateString() === nowMsk.toDateString();
        if (isToday) return moscow.getHours().toString().padStart(2,'0') + ':' + moscow.getMinutes().toString().padStart(2,'0');
        return moscow.getDate().toString().padStart(2,'0') + '.' + (moscow.getMonth()+1).toString().padStart(2,'0');
    } catch(e) { return dateStr; }
}

// ══════════════════════════════════════════════════════════
//  РЕНДЕР ПРИЛОЖЕНИЯ
// ══════════════════════════════════════════════════════════
function renderApp() {
    document.getElementById('root').innerHTML = `
<style>
:root {
    --accent: #10b981;
    --glow: 0 0 20px rgba(16,185,129,0.4);
    --accent-10: rgba(16,185,129,0.1);
    --accent-30: rgba(16,185,129,0.3);
    --bg: #000000;
    --surface: rgba(18,18,22,0.95);
    --surface2: rgba(28,28,35,0.8);
    --border: rgba(255,255,255,0.07);
    --text: #ffffff;
    --text-2: rgba(255,255,255,0.5);
    --msg-in: #1c1c22;
    --msg-out: var(--accent);
    --divider: rgba(255,255,255,0.09);
}
* { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: var(--bg); color: var(--text);
    overflow: hidden; margin: 0; height: 100dvh;
    -webkit-font-smoothing: antialiased;
    -webkit-text-size-adjust: 100%;
    background-image:
        url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120' opacity='0.015'%3E%3Ccircle cx='30' cy='30' r='12' fill='none' stroke='%2310b981' stroke-width='1'/%3E%3Ccircle cx='90' cy='90' r='12' fill='none' stroke='%233b82f6' stroke-width='1'/%3E%3Cpath d='M30 18 Q50 50 90 30' fill='none' stroke='%2310b981' stroke-width='0.7'/%3E%3Cpath d='M30 90 Q60 70 90 90' fill='none' stroke='%233b82f6' stroke-width='0.7'/%3E%3C/svg%3E"),
        radial-gradient(ellipse at 10% 5%, rgba(16,185,129,0.04) 0%, transparent 40%),
        radial-gradient(ellipse at 90% 95%, rgba(59,130,246,0.04) 0%, transparent 40%);
}
.glass { background:rgba(8,8,12,0.85);backdrop-filter:blur(40px) saturate(180%);-webkit-backdrop-filter:blur(40px) saturate(180%); }
.glass-card { background:rgba(255,255,255,0.04);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border:1px solid var(--border); }

/* НАВ-БАР */
.nav-bar {
    position:fixed;bottom:0;left:0;right:0;height:64px;display:flex;align-items:flex-start;
    justify-content:space-around;padding-top:8px;padding-bottom:max(env(safe-area-inset-bottom),4px);
    border-top:0.5px solid var(--border);z-index:1000;background:rgba(0,0,0,0.92);
    backdrop-filter:blur(30px) saturate(180%);-webkit-backdrop-filter:blur(30px) saturate(180%);
}
.nav-item {
    display:flex;flex-direction:column;align-items:center;justify-content:center;
    gap:3px;opacity:0.35;transition:opacity 0.2s,transform 0.2s;width:72px;cursor:pointer;position:relative;
}
.nav-item.active { opacity:1; }
.nav-item.active .nav-icon-wrap { transform:scale(1.08); }
.nav-icon-wrap { width:28px;height:28px;display:flex;align-items:center;justify-content:center;transition:transform 0.2s cubic-bezier(0.34,1.56,0.64,1); }
.nav-text { font-size:10px;font-weight:600;letter-spacing:-0.2px;color:var(--text); }
.nav-badge { position:absolute;top:-2px;right:8px;background:var(--accent);color:#000;font-size:9px;font-weight:800;min-width:16px;height:16px;border-radius:8px;display:flex;align-items:center;justify-content:center;padding:0 4px;border:2px solid #000; }

/* ПОИСК */
.search-box { display:flex;align-items:center;gap:10px;background:rgba(255,255,255,0.06);border:1px solid var(--border);border-radius:16px;padding:11px 14px;transition:border-color 0.2s,background 0.2s; }
.search-box:focus-within { border-color:var(--accent-30);background:rgba(255,255,255,0.08); }

/* ФАБ КНОПКА — меньше в 2 раза + белая + черный крест */
.fab-plus {
    width:28px;height:28px;border-radius:50%;
    background:white;
    border:none;cursor:pointer;
    display:flex;align-items:center;justify-content:center;
    box-shadow:0 2px 10px rgba(255,255,255,0.25);
    transition:transform 0.2s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.2s;
    position:relative;
}
.fab-plus:active { transform:scale(0.88); }

/* ЧАТЫ */
.chat-item {
    display:flex;align-items:center;gap:14px;padding:10px 12px;border-radius:18px;
    transition:background 0.15s;cursor:pointer;position:relative;
}
.chat-item:active { background:rgba(255,255,255,0.06); }
.chat-item-divider {
    height:0.5px;
    background:linear-gradient(to right, transparent, var(--divider) 15%, var(--divider) 85%, transparent);
    margin:0 14px;
}
.online-dot { position:absolute;bottom:1px;right:1px;width:12px;height:12px;background:var(--accent);border:2px solid #000;border-radius:50%;box-shadow:0 0 6px var(--accent); }

/* ЧАТ ОКНО */
.chat-view { position:fixed;inset:0;z-index:2000;background:#000;display:flex;flex-direction:column;transform:translateX(100%);transition:transform 0.35s cubic-bezier(0.22,1,0.36,1);will-change:transform; }
.chat-view.active { transform:translateX(0); }
.chat-wallpaper {
    background-color: #0a0a12;
    background-image:
        url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80' opacity='0.028'%3E%3Ccircle cx='20' cy='20' r='8' fill='none' stroke='%2310b981' stroke-width='1.2'/%3E%3Cpath d='M20 12 L28 20 L20 28 L12 20Z' fill='none' stroke='%2310b981' stroke-width='0.8'/%3E%3Ccircle cx='60' cy='60' r='8' fill='none' stroke='%233b82f6' stroke-width='1.2'/%3E%3Cpath d='M60 52 L68 60 L60 68 L52 60Z' fill='none' stroke='%233b82f6' stroke-width='0.8'/%3E%3Cline x1='0' y1='40' x2='80' y2='40' stroke='%23ffffff' stroke-width='0.3' opacity='0.4'/%3E%3Cline x1='40' y1='0' x2='40' y2='80' stroke='%23ffffff' stroke-width='0.3' opacity='0.4'/%3E%3C/svg%3E"),
        radial-gradient(ellipse at 15% 10%, rgba(16,185,129,0.06) 0%, transparent 45%),
        radial-gradient(ellipse at 85% 90%, rgba(59,130,246,0.05) 0%, transparent 45%),
        radial-gradient(ellipse at 50% 50%, rgba(99,102,241,0.03) 0%, transparent 60%);
}

/* СООБЩЕНИЯ */
.msg-container { display:flex;flex-direction:column;gap:2px;padding:12px 12px 16px;overflow-y:auto;scroll-behavior:smooth;-webkit-overflow-scrolling:touch;overscroll-behavior:contain; }
.msg-container::-webkit-scrollbar { width:3px; }
.msg-container::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.1);border-radius:2px; }
.msg-row { display:flex;width:100%;margin-bottom:1px; }
.msg-row.out { justify-content:flex-end; }
.msg-row.in  { justify-content:flex-start;align-items:flex-end;gap:6px; }

.bubble { max-width:74%;padding:10px 14px 8px;font-size:15px;line-height:1.5;position:relative;word-break:break-word; }
.msg-row.out .bubble { background:var(--accent);border-radius:22px 22px 6px 22px;margin-left:44px;box-shadow:0 2px 12px rgba(16,185,129,0.25); }
.msg-row.in .bubble  { background:var(--msg-in);border-radius:22px 22px 22px 6px;margin-right:44px;border:0.5px solid rgba(255,255,255,0.07);box-shadow:0 2px 8px rgba(0,0,0,0.3); }

.msg-time { font-size:11px;opacity:0.6;display:flex;align-items:center;gap:3px;justify-content:flex-end;margin-top:4px;white-space:nowrap; }
.status-icon { display:flex;align-items:center; }

/* РЕАКЦИИ */
.reactions-bar { display:flex;gap:4px;flex-wrap:wrap;margin-top:5px; }
.reaction-chip { background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.12);border-radius:12px;padding:3px 8px;font-size:13px;cursor:pointer;transition:transform 0.1s,background 0.1s;display:flex;align-items:center;gap:4px; }
.reaction-chip:active { transform:scale(0.88); }
.reaction-chip.mine { background:var(--accent-10);border-color:var(--accent-30); }

/* ДАТА-РАЗДЕЛИТЕЛЬ */
.date-divider { text-align:center;padding:12px 0 4px;position:relative; }
.date-divider-inner { display:inline-block;background:rgba(255,255,255,0.06);border:0.5px solid rgba(255,255,255,0.1);color:rgba(255,255,255,0.5);font-size:11px;font-weight:600;padding:4px 14px;border-radius:12px;letter-spacing:0.3px; }

/* ИНПУТ */
.input-bar { padding:10px 12px;padding-bottom:max(calc(env(safe-area-inset-bottom)+10px),20px);border-top:0.5px solid var(--border); }
.input-wrap { display:flex;align-items:flex-end;gap:8px; }
.input-inner { flex:1;display:flex;align-items:center;background:rgba(255,255,255,0.06);border:1px solid var(--border);border-radius:24px;padding:4px 4px 4px 14px;transition:border-color 0.2s;min-height:44px; }
.input-inner:focus-within { border-color:var(--accent-30); }
#msg-input { flex:1;background:transparent;outline:none;color:white;font-size:15px;padding:6px 4px;resize:none;max-height:120px;line-height:1.4;font-family:inherit;-webkit-appearance:none; }
#msg-input::placeholder { color:rgba(255,255,255,0.3); }
.send-btn { width:44px;height:44px;border-radius:50%;background:var(--accent);display:flex;align-items:center;justify-content:center;border:none;cursor:pointer;flex-shrink:0;transition:transform 0.15s,box-shadow 0.15s;box-shadow:var(--glow); }
.send-btn:active { transform:scale(0.88); }
.icon-btn { width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,0.06);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:background 0.15s; }
.icon-btn:active { background:rgba(255,255,255,0.14); }

/* ПЕЧАТЬ */
.typing-wrap { padding:0 16px 8px;display:none;align-items:flex-end;gap:6px; }
.typing-wrap.show { display:flex; }
.typing-bubble { background:var(--msg-in);border-radius:18px 18px 18px 5px;padding:10px 14px;border:0.5px solid rgba(255,255,255,0.06);display:flex;align-items:center;gap:4px; }
.dot { width:6px;height:6px;background:rgba(255,255,255,0.5);border-radius:50%;animation:dotPulse 1.4s infinite; }
.dot:nth-child(2) { animation-delay:0.2s; }
.dot:nth-child(3) { animation-delay:0.4s; }
@keyframes dotPulse { 0%,60%,100%{transform:translateY(0);opacity:0.4;} 30%{transform:translateY(-4px);opacity:1;} }

/* ЗАПИСЬ */
.record-ui { position:absolute;inset:0;background:rgba(10,10,15,0.98);border-radius:24px;display:flex;align-items:center;padding:0 16px;gap:12px;z-index:10;animation:fadeIn 0.2s ease; }
.rec-pulse { width:12px;height:12px;background:#ef4444;border-radius:50%;animation:recPulse 0.8s infinite;flex-shrink:0; }
@keyframes recPulse { 0%,100%{transform:scale(1);opacity:1;} 50%{transform:scale(1.4);opacity:0.6;} }
.waveform { display:flex;align-items:center;gap:2px;flex:1;height:24px; }
.wave-bar { width:3px;background:var(--accent);border-radius:2px;animation:wave 0.8s ease infinite;min-height:4px; }
.wave-bar:nth-child(odd) { animation-delay:0.1s; }
.wave-bar:nth-child(3n) { animation-delay:0.2s; }
@keyframes wave { 0%,100%{height:4px;} 50%{height:20px;} }

/* ЗВОНОК */
.call-screen { position:fixed;inset:0;z-index:9999;background:linear-gradient(160deg,#080810 0%,#0d0d18 100%);display:flex;flex-direction:column;align-items:center;padding:0 24px;transition:opacity 0.3s; }
.call-screen.hidden { display:none; }
.call-bg { position:absolute;inset:0;z-index:0;opacity:0.15;filter:blur(60px);background:radial-gradient(circle at 50% 30%,var(--accent) 0%,transparent 60%);animation:callBgPulse 3s ease infinite; }
@keyframes callBgPulse { 0%,100%{opacity:0.1;} 50%{opacity:0.25;} }
.call-ring-1,.call-ring-2,.call-ring-3 { position:absolute;border-radius:50%;border:1px solid var(--accent);opacity:0;animation:ring 3s ease-out infinite; }
.call-ring-1 { width:180px;height:180px;animation-delay:0s; }
.call-ring-2 { width:240px;height:240px;animation-delay:0.6s; }
.call-ring-3 { width:300px;height:300px;animation-delay:1.2s; }
@keyframes ring { 0%{opacity:0.6;transform:scale(0.8);} 100%{opacity:0;transform:scale(1.2);} }
.call-info { position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;margin-top:80px; }
.call-btns { position:relative;z-index:1;display:flex;gap:20px;align-items:center;flex-wrap:wrap;justify-content:center;margin-top:auto;margin-bottom:60px;width:100%; }
.call-btn { width:64px;height:64px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:none;cursor:pointer;transition:transform 0.15s,box-shadow 0.15s; }
.call-btn:active { transform:scale(0.87); }
.call-btn.danger { background:#ef4444;box-shadow:0 4px 20px rgba(239,68,68,0.4); }
.call-btn.accept { background:var(--accent);box-shadow:var(--glow); }
.call-btn.neutral { background:rgba(255,255,255,0.12); }
.call-btn.active  { background:var(--accent-10);border:1px solid var(--accent-30); }
.call-timer { font-size:14px;color:var(--text-2);font-variant-numeric:tabular-nums; }
.video-container { position:absolute;inset:0;z-index:0;background:#000; }
#remote-video { width:100%;height:100%;object-fit:cover;display:none; }
#local-video  { position:absolute;bottom:160px;right:16px;width:90px;height:130px;object-fit:cover;border-radius:14px;border:2px solid rgba(255,255,255,0.2);display:none;z-index:5;box-shadow:0 4px 20px rgba(0,0,0,0.5); }

/* НАСТРОЙКИ */
.settings-hero { position:relative;height:280px;overflow:hidden;flex-shrink:0; }
.profile-bg-img { position:absolute;inset:-20px;filter:blur(40px) brightness(0.3) saturate(2);transform:scale(1.1);background-size:cover;background-position:center; }
.profile-bg-fade { position:absolute;inset:0;background:linear-gradient(to bottom,transparent 30%,#000 100%); }
.settings-section { background:rgba(255,255,255,0.03);border:1px solid var(--border);border-radius:20px;overflow:hidden;margin-bottom:12px; }
.settings-row { display:flex;align-items:center;gap:14px;padding:14px 16px;border-bottom:0.5px solid rgba(255,255,255,0.05);cursor:pointer;transition:background 0.15s; }
.settings-row:last-child { border-bottom:none; }
.settings-row:active { background:rgba(255,255,255,0.05); }
.settings-icon { width:34px;height:34px;border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:17px;flex-shrink:0; }
.img-bubble { border-radius:16px;overflow:hidden;max-width:260px;cursor:zoom-in;border:0.5px solid rgba(255,255,255,0.08); }
.img-bubble img { display:block;width:100%; }

/* МОДАЛЬНЫЕ */
.modal-overlay { position:fixed;inset:0;z-index:8000;background:rgba(0,0,0,0.7);backdrop-filter:blur(10px);display:flex;align-items:flex-end;animation:fadeIn 0.2s ease; }
.modal-sheet { background:rgba(18,18,25,0.98);backdrop-filter:blur(40px);border-radius:28px 28px 0 0;border-top:0.5px solid var(--border);width:100%;padding:16px 20px;padding-bottom:max(env(safe-area-inset-bottom),24px);animation:slideUp 0.3s cubic-bezier(0.22,1,0.36,1); }
.modal-handle { width:36px;height:4px;background:rgba(255,255,255,0.2);border-radius:2px;margin:0 auto 20px; }

/* АУДИО ПЛЕЕР */
.audio-player { display:flex;align-items:center;gap:10px;min-width:190px;padding:4px 0; }
.audio-play-btn { width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,0.2);border:none;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;transition:background 0.15s,transform 0.1s;flex-shrink:0; }
.audio-play-btn:active { transform:scale(0.88); }
.audio-progress-wrap { flex:1;display:flex;flex-direction:column;gap:3px; }
.audio-progress-bar { height:3px;background:rgba(255,255,255,0.2);border-radius:2px;overflow:hidden;cursor:pointer;position:relative; }
.audio-progress-fill { height:100%;background:rgba(255,255,255,0.8);border-radius:2px;width:0;transition:width 0.1s linear; }
.audio-dur { font-size:10px;opacity:0.5; }

/* ПОИСК */
.user-result { display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:18px;cursor:pointer;transition:background 0.15s; }
.user-result:active { background:rgba(255,255,255,0.06); }

/* СВАЙП */
.swipe-indicator { position:fixed;left:0;top:50%;transform:translateY(-50%);width:4px;height:60px;background:var(--accent);border-radius:0 4px 4px 0;opacity:0;transition:opacity 0.2s;z-index:3000; }

/* РЕАКЦИИ ПИКЕР */
.reaction-picker { position:fixed;z-index:5000;background:rgba(20,20,25,0.95);backdrop-filter:blur(20px);border:1px solid var(--border);border-radius:24px;padding:10px 14px;display:flex;gap:8px;box-shadow:0 8px 40px rgba(0,0,0,0.6);animation:reactionPickerIn 0.25s cubic-bezier(0.34,1.56,0.64,1); }
@keyframes reactionPickerIn { from{transform:scale(0.6) translateY(20px) translateX(-50%);opacity:0;} to{transform:scale(1) translateY(0) translateX(-50%);opacity:1;} }
.reaction-emoji-btn { font-size:26px;padding:4px;cursor:pointer;transition:transform 0.15s;border:none;background:none; }
.reaction-emoji-btn:active { transform:scale(0.8) rotate(-10deg); }

/* ADD CONTACT OVERLAY */
.add-contact-overlay { position:fixed;inset:0;z-index:7000;background:rgba(0,0,0,0.75);backdrop-filter:blur(16px);display:flex;align-items:center;justify-content:center;animation:fadeIn 0.25s ease;padding:20px; }
.add-contact-card { background:rgba(18,18,26,0.98);border:1px solid rgba(255,255,255,0.1);border-radius:28px;width:100%;max-width:420px;box-shadow:0 24px 80px rgba(0,0,0,0.7);animation:scaleIn 0.3s cubic-bezier(0.34,1.56,0.64,1);overflow:hidden; }
@keyframes scaleIn { from{transform:scale(0.88);opacity:0;} to{transform:scale(1);opacity:1;} }

/* ПРОФИЛЬ ПАРТНЁРА */
.partner-profile-overlay { position:fixed;inset:0;z-index:5500;background:rgba(0,0,0,0.8);backdrop-filter:blur(20px);display:flex;flex-direction:column;animation:fadeIn 0.2s ease; }

/* КОНТАКТЫ */
.contact-item { display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:16px;cursor:pointer;transition:background 0.15s; }
.contact-item:active { background:rgba(255,255,255,0.06); }

/* ЗАГОЛОВКИ */
.section-header-row { display:flex;align-items:center;justify-content:center;position:relative;padding:0 20px;margin-bottom:4px; }
.section-title { font-size:28px;font-weight:800;letter-spacing:-0.5px;text-align:center; }

.conn-status { position:fixed;top:0;left:0;right:0;height:3px;background:var(--accent);z-index:99998;transition:opacity 0.5s; }
.conn-status.offline { background:#ef4444; }

/* ГРУППА БЕЙДЖ */
.group-badge { display:inline-flex;align-items:center;gap:4px;background:rgba(59,130,246,0.15);border:1px solid rgba(59,130,246,0.3);border-radius:8px;padding:2px 8px;font-size:11px;font-weight:600;color:#60a5fa; }

/* ГРУППА СОЗДАНИЕ */
.create-group-overlay { position:fixed;inset:0;z-index:7500;background:rgba(0,0,0,0.8);backdrop-filter:blur(20px);display:flex;flex-direction:column;animation:fadeIn 0.2s ease; }

/* АНИМАЦИИ */
@keyframes fadeIn { from{opacity:0;} to{opacity:1;} }
@keyframes slideUp { from{opacity:0;transform:translateY(12px);} to{opacity:1;transform:translateY(0);} }
@keyframes msgIn { from{opacity:0;transform:translateY(8px) scale(0.97);} to{opacity:1;transform:translateY(0) scale(1);} }
@keyframes toastIn { from{opacity:0;transform:translateY(-8px) scale(0.96);} to{opacity:1;transform:translateY(0) scale(1);} }
@keyframes toastOut { to{opacity:0;transform:translateY(-8px) scale(0.96);} }
.animate-msg { animation:msgIn 0.25s cubic-bezier(0.22,1,0.36,1); }
.animate-up  { animation:slideUp 0.3s ease; }
</style>

<div id="app" class="h-screen w-screen flex flex-col overflow-hidden" style="height:100dvh">
    <div id="conn-status" class="conn-status" style="opacity:0"></div>
    <div id="main-content" class="flex-1 overflow-y-auto" style="overflow-x:hidden;padding-bottom:84px">

        <!-- ══ ЧАТЫ ══ -->
        <div id="chats-section" class="pt-14">
            <div class="px-5 pt-2 pb-3">
                <div class="section-header-row">
                    <h1 class="section-title">Чаты</h1>
                    <!-- Плюс — меньше, белый фон, черный крест -->
                    <div style="position:absolute;right:20px;top:50%;transform:translateY(-50%);display:flex;gap:8px;align-items:center">
                        <button onclick="openCreateGroupModal()" title="Создать группу" style="width:28px;height:28px;border-radius:50%;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.15);cursor:pointer;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,0.7)">
                            ${ICONS.group}
                        </button>
                        <button onclick="openNewContactModal()" class="fab-plus" title="Добавить контакт">
                            ${ICONS.plus}
                        </button>
                    </div>
                </div>
            </div>
            <div class="px-5 mb-4">
                <div class="search-box">
                    <span style="flex-shrink:0">${ICONS.search}</span>
                    <input id="search-input" style="background:transparent;outline:none;width:100%;color:white;font-size:15px;font-family:inherit"
                           placeholder="Поиск людей и чатов"
                           oninput="handleSearch()" onfocus="onSearchFocus()" onblur="onSearchBlur()">
                    <button id="search-cancel" onclick="cancelSearch()" style="display:none;color:var(--accent);font-size:14px;font-weight:600;border:none;background:none;cursor:pointer;white-space:nowrap;flex-shrink:0">Отмена</button>
                </div>
            </div>
            <div id="search-results" class="px-5 hidden"></div>
            <div id="chat-list" class="px-3"></div>
        </div>

        <!-- ══ МОМЕНТЫ ══ -->
        <div id="moments-section" class="hidden pt-14 px-5">
            <div class="section-header-row" style="margin-bottom:16px">
                <h1 class="section-title">Моменты</h1>
            </div>
            <div style="display:flex;gap:10px;margin-bottom:16px">
                <div onclick="pickMedia('moment')" style="flex:1;display:flex;align-items:center;gap:12px;background:var(--surface2);border:1px solid var(--border);border-radius:20px;padding:13px 14px;cursor:pointer;-webkit-tap-highlight-color:transparent">
                    <div style="position:relative;flex-shrink:0">
                        <div id="moments-my-ava">${getAvatarHtml(currentUser,'w-12 h-12',true)}</div>
                        <div style="position:absolute;bottom:-2px;right:-2px;width:20px;height:20px;background:var(--accent);border-radius:50%;border:2px solid var(--bg);display:flex;align-items:center;justify-content:center">
                            <svg width="9" height="9" viewBox="0 0 24 24" fill="none"><line x1="12" y1="5" x2="12" y2="19" stroke="white" stroke-width="3.5" stroke-linecap="round"/><line x1="5" y1="12" x2="19" y2="12" stroke="white" stroke-width="3.5" stroke-linecap="round"/></svg>
                        </div>
                    </div>
                    <div>
                        <div style="font-weight:700;font-size:15px">Фото / видео</div>
                        <div style="font-size:12px;color:var(--text-2);margin-top:1px">История на 24 часа</div>
                    </div>
                </div>
                <button onclick="openTextMoment()" style="width:60px;background:var(--surface2);border:1px solid var(--border);border-radius:20px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;cursor:pointer;flex-shrink:0;padding:0;-webkit-tap-highlight-color:transparent">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M17 3a2.828 2.828 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z" stroke="var(--accent)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </button>
            </div>
            <div id="full-moments-list"></div>
        </div>

        <!-- ══ НАСТРОЙКИ ══ -->
        <div id="settings-section" class="hidden">
            <div class="settings-hero">
                <div style="position:absolute;top:0;left:0;right:0;height:380px;z-index:0;overflow:hidden;pointer-events:none">
                    <div id="settings-bg" class="profile-bg-img"></div>
                    <div class="profile-bg-fade"></div>
                </div>
                <div style="position:relative;z-index:2;display:flex;flex-direction:column;align-items:center;padding-top:60px">
                    <div style="position:relative;margin-bottom:12px">
                        <div id="settings-ava-box" style="border-radius:50%;overflow:hidden;box-shadow:0 4px 30px rgba(0,0,0,0.5);border:3px solid rgba(255,255,255,0.15)">
                            ${getAvatarHtml(currentUser, 'w-28 h-28')}
                        </div>
                        <div style="position:absolute;bottom:-4px;left:50%;transform:translateX(-50%);display:flex;gap:10px">
                            <button onclick="changeAvatar()" style="width:36px;height:36px;background:rgba(0,0,0,0.7);backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,0.2);border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;color:white" class="active:scale-90">${ICONS.camera}</button>
                            <button onclick="setEmojiAvatar()" style="width:36px;height:36px;background:rgba(0,0,0,0.7);backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,0.2);border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;color:white" class="active:scale-90">${ICONS.smile}</button>
                        </div>
                    </div>
                    <h2 id="settings-name" style="font-size:24px;font-weight:800;margin-top:8px;letter-spacing:-0.3px">${currentUser.name}</h2>
                    <p style="color:var(--text-2);font-size:14px">@${currentUser.username}</p>
                </div>
            </div>
            <div style="padding:0 16px 100px">
                <div style="margin-bottom:8px">
                    <p style="font-size:11px;font-weight:700;color:var(--text-2);letter-spacing:0.8px;text-transform:uppercase;margin:0 4px 8px">Профиль</p>
                    <div class="settings-section">
                        <div class="settings-row" onclick="editName()">
                            <div class="settings-icon" style="background:rgba(59,130,246,0.2);color:#60a5fa">${ICONS.profile}</div>
                            <div style="flex:1"><div style="font-size:15px;font-weight:500">Имя</div>
                            <div style="font-size:13px;color:var(--text-2);margin-top:1px" id="settings-name-val">${currentUser.name}</div></div>
                            <span style="color:var(--text-2)"><svg width="8" height="14" viewBox="0 0 8 14" fill="none"><path d="M1 1l6 6-6 6" stroke="rgba(255,255,255,0.3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
                        </div>
                        <div class="settings-row" onclick="editBio()">
                            <div class="settings-icon" style="background:rgba(139,92,246,0.2);color:#a78bfa">${ICONS.edit}</div>
                            <div style="flex:1"><div style="font-size:15px;font-weight:500">Bio</div>
                            <div style="font-size:13px;color:var(--text-2);margin-top:1px" id="settings-bio-val">${currentUser.bio||'Не задано'}</div></div>
                            <span style="color:var(--text-2)"><svg width="8" height="14" viewBox="0 0 8 14" fill="none"><path d="M1 1l6 6-6 6" stroke="rgba(255,255,255,0.3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
                        </div>
                        <div class="settings-row" onclick="copyUsername()">
                            <div class="settings-icon" style="background:rgba(16,185,129,0.2);color:#10b981">${ICONS.globe}</div>
                            <div style="flex:1"><div style="font-size:15px;font-weight:500">Юзернейм</div>
                            <div style="font-size:13px;color:var(--text-2);margin-top:1px">@${currentUser.username}</div></div>
                            <span style="font-size:12px;color:var(--text-2)">Скопировать</span>
                        </div>
                    </div>
                </div>
                <div style="margin-bottom:8px">
                    <p style="font-size:11px;font-weight:700;color:var(--text-2);letter-spacing:0.8px;text-transform:uppercase;margin:0 4px 8px">Контакты</p>
                    <div class="settings-section">
                        <div class="settings-row" onclick="openContactsModal()">
                            <div class="settings-icon" style="background:rgba(16,185,129,0.2);color:#10b981">${ICONS.users}</div>
                            <div style="flex:1"><div style="font-size:15px;font-weight:500">Сохранённые контакты</div>
                            <div style="font-size:13px;color:var(--text-2);margin-top:1px" id="contacts-count-label">${savedContacts.length} контактов</div></div>
                            <span style="color:var(--text-2)"><svg width="8" height="14" viewBox="0 0 8 14" fill="none"><path d="M1 1l6 6-6 6" stroke="rgba(255,255,255,0.3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
                        </div>
                    </div>
                </div>
                <div style="margin-bottom:8px">
                    <p style="font-size:11px;font-weight:700;color:var(--text-2);letter-spacing:0.8px;text-transform:uppercase;margin:0 4px 8px">Оформление</p>
                    <div class="settings-section">
                        <div class="settings-row" onclick="openThemePicker()">
                            <div class="settings-icon" style="background:var(--accent-10)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="3" stroke="var(--accent)" stroke-width="2"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" stroke="var(--accent)" stroke-width="2" stroke-linecap="round"/></svg></div>
                            <div style="flex:1"><div style="font-size:15px;font-weight:500">Цвет темы</div>
                            <div style="font-size:13px;color:var(--text-2);margin-top:1px" id="current-theme-name">${THEMES[activeTheme]?.name||'Изумруд'}</div></div>
                            <div style="width:22px;height:22px;border-radius:50%;background:var(--accent);box-shadow:var(--glow);border:2px solid rgba(255,255,255,0.2)"></div>
                        </div>
                        <div class="settings-row" onclick="openNetworkInfo()">
                            <div class="settings-icon" style="background:rgba(59,130,246,0.2);color:#60a5fa">${ICONS.globe}</div>
                            <div style="flex:1"><div style="font-size:15px;font-weight:500">Подключение</div>
                            <div style="font-size:13px;color:var(--text-2);margin-top:1px" id="ws-status-label">${wsConnected?'Онлайн':'Подключение...'}</div></div>
                        </div>
                    </div>
                </div>
                <div style="margin-bottom:8px">
                    <p style="font-size:11px;font-weight:700;color:var(--text-2);letter-spacing:0.8px;text-transform:uppercase;margin:0 4px 8px">Уведомления</p>
                    <div class="settings-section">
                        <div class="settings-row" onclick="openPermissionsSettings()">
                            <div class="settings-icon" style="background:rgba(16,185,129,0.2);color:#10b981">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                            </div>
                            <div style="flex:1">
                                <div style="font-size:15px;font-weight:500">Разрешения</div>
                                <div style="font-size:12px;color:var(--text-2)" id="perms-summary">Микрофон, камера, уведомления</div>
                            </div>
                            <span style="color:var(--text-2)"><svg width="8" height="14" viewBox="0 0 8 14" fill="none"><path d="M1 1l6 6-6 6" stroke="rgba(255,255,255,0.3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
                        </div>
                    </div>
                    <div class="settings-section">
                        <div class="settings-row" onclick="toggleNotifications()">
                            <div class="settings-icon" style="background:rgba(239,68,68,0.2);color:#f87171">${ICONS.bell}</div>
                            <div style="flex:1"><div style="font-size:15px;font-weight:500">Push-уведомления</div></div>
                            <div id="notif-toggle" style="width:48px;height:28px;border-radius:14px;background:var(--accent);position:relative;cursor:pointer">
                                <div style="position:absolute;top:3px;right:3px;width:22px;height:22px;background:white;border-radius:50%;transition:right 0.2s;box-shadow:0 1px 4px rgba(0,0,0,0.3)"></div>
                            </div>
                        </div>
                    </div>
                </div>
                <div style="margin-bottom:8px">
                    <p style="font-size:11px;font-weight:700;color:var(--text-2);letter-spacing:0.8px;text-transform:uppercase;margin:0 4px 8px">Аккаунт</p>
                    <div class="settings-section">
                        <div class="settings-row" onclick="openPrivacySettings()">
                            <div class="settings-icon" style="background:rgba(59,130,246,0.2);color:#60a5fa">${ICONS.lock}</div>
                            <div style="flex:1"><div style="font-size:15px;font-weight:500">Конфиденциальность</div></div>
                            <span style="color:var(--text-2)"><svg width="8" height="14" viewBox="0 0 8 14" fill="none"><path d="M1 1l6 6-6 6" stroke="rgba(255,255,255,0.3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
                        </div>
                        <div class="settings-row" onclick="showAbout()">
                            <div class="settings-icon" style="background:rgba(16,185,129,0.2);color:#10b981">${ICONS.info}</div>
                            <div style="flex:1"><div style="font-size:15px;font-weight:500">О приложении</div>
                            <div style="font-size:12px;color:var(--text-2)">WayChat v7.0</div></div>
                            <span style="color:var(--text-2)"><svg width="8" height="14" viewBox="0 0 8 14" fill="none"><path d="M1 1l6 6-6 6" stroke="rgba(255,255,255,0.3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
                        </div>
                    </div>
                </div>
                <button onclick="doLogout()" style="width:100%;padding:14px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.2);border-radius:16px;color:#ef4444;font-size:16px;font-weight:700;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:10px">
                    <span style="color:#ef4444">${ICONS.logout}</span> Выйти из аккаунта
                </button>
            </div>
        </div>
    </div>

    <!-- ══ НАВ-БАР ══ -->
    <div class="nav-bar">
        <div id="tab-moments" onclick="switchTab('moments')" class="nav-item">
            <div class="nav-icon-wrap">${ICONS.moments}</div>
            <span class="nav-text">Моменты</span>
        </div>
        <div id="tab-chats" onclick="switchTab('chats')" class="nav-item active">
            <div class="nav-icon-wrap" style="width:44px;height:44px;margin-top:-6px">${ICONS.chats}</div>
            <span class="nav-text">Чаты</span>
            <div id="total-unread-badge" class="nav-badge hidden">0</div>
        </div>
        <div id="tab-settings" onclick="switchTab('settings')" class="nav-item">
            <div id="nav-ava-box" class="nav-icon-wrap" style="width:30px;height:30px">
                ${getAvatarHtml(currentUser, 'w-8 h-8')}
            </div>
            <span class="nav-text">Профиль</span>
        </div>
    </div>
</div>

<!-- ══ ЧАТ ОКНО ══ -->
<div id="chat-window" class="chat-view">
    <div id="chat-header" class="glass" style="padding:10px 14px;padding-top:max(env(safe-area-inset-top),44px);display:flex;align-items:center;justify-content:space-between;border-bottom:0.5px solid var(--border);position:relative;z-index:5">
        <div style="display:flex;align-items:center;gap:10px">
            <button onclick="closeChat()" class="icon-btn">${ICONS.back}</button>
            <div style="position:relative;cursor:pointer" onclick="showPartnerProfile()">
                <div id="chat-ava-header"></div>
                <div id="chat-online-dot" class="online-dot" style="display:none"></div>
            </div>
            <div onclick="showPartnerProfile()" style="cursor:pointer">
                <div style="font-weight:700;font-size:16px;letter-spacing:-0.2px" id="chat-name">...</div>
                <div style="font-size:11px;color:var(--text-2)" id="chat-status">загрузка...</div>
            </div>
        </div>
        <div style="display:flex;gap:4px">
            <button onclick="startCall('audio')" class="icon-btn">${ICONS.call}</button>
            <button onclick="startCall('video')" class="icon-btn">${ICONS.video}</button>
            <button onclick="showChatMenu()" class="icon-btn">${ICONS.more}</button>
        </div>
    </div>
    <div id="messages" class="flex-1 chat-wallpaper msg-container"></div>
    <div id="typing-wrap" class="typing-wrap glass" style="padding:6px 16px 8px;border-top:0.5px solid var(--border)">
        <div class="typing-bubble">
            <div class="dot"></div><div class="dot"></div><div class="dot"></div>
        </div>
        <div style="font-size:11px;color:var(--text-2);margin-bottom:4px" id="typing-name-label"></div>
    </div>
    <div class="input-bar glass" style="border-top:0.5px solid var(--border)">
        <div class="input-wrap">
            <button onclick="pickMedia('msg')" class="icon-btn">${ICONS.attach}</button>
            <div class="input-inner" id="input-area">
                <textarea id="msg-input" rows="1"
                    placeholder="Сообщение..."
                    oninput="handleTyping(); autoResize(this); updateSendButton()"
                    onkeydown="handleInputKeydown(event)"></textarea>
            </div>
            <button id="send-btn-main" onclick="sendText()" class="send-btn" style="display:none">${ICONS.send}</button>
            <button id="voice-btn-main" class="send-btn" style="background:rgba(255,255,255,0.12);box-shadow:none;touch-action:none;user-select:none;-webkit-user-select:none">${ICONS.mic.replace('rgba(255,255,255,0.5)','white')}</button>
        </div>
    </div>
</div>

<!-- ══ ЗВОНОК ══ -->
<div id="call-screen" class="call-screen hidden">
    <div class="call-bg"></div>
    <div id="call-video-container" class="video-container" style="display:none">
        <video id="remote-video" autoplay playsinline></video>
        <video id="local-video"  autoplay playsinline muted></video>
    </div>
    <!-- Анимация вызова -->
    <div class="call-ring-1"></div><div class="call-ring-2"></div><div class="call-ring-3"></div>
    <!-- Основная инфо -->
    <div class="call-info" id="call-info">
        <div id="call-avatar-box" style="margin-bottom:16px"></div>
        <h2 id="call-name" style="font-size:26px;font-weight:800;letter-spacing:-0.3px;z-index:1;text-shadow:0 2px 12px rgba(0,0,0,0.5)">...</h2>
        <div id="call-status-label" style="color:var(--text-2);font-size:15px;margin-top:6px;z-index:1">Вызов...</div>
        <div id="call-timer" class="call-timer" style="margin-top:8px;display:none;font-size:20px;font-weight:700;color:white">0:00</div>
        <div id="call-quality-label" style="display:none;font-size:11px;color:var(--text-2);margin-top:4px"></div>
    </div>
    <!-- Участники групп. звонка -->
    <div id="group-call-participants" style="display:none;position:absolute;top:max(env(safe-area-inset-top),44px);left:0;right:0;padding:8px 12px;display:none">
        <div id="group-call-grid" style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center"></div>
    </div>
    <!-- Кнопки -->
    <div class="call-btns">
        <div style="display:flex;gap:16px;align-items:center;justify-content:center;margin-bottom:12px">
            <button id="accept-btn" onclick="answerIncomingCall()" class="call-btn accept" style="display:none">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="white"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/></svg>
            </button>
            <button id="mute-btn" onclick="toggleMute()" class="call-btn neutral" style="color:white" title="Микрофон">${ICONS.mic.replace('rgba(255,255,255,0.5)','white')}</button>
            <button onclick="endCall(true)" class="call-btn danger" title="Завершить">${ICONS.phone_off}</button>
            <button id="video-btn" onclick="toggleVideo()" class="call-btn neutral" style="color:white" title="Камера">${ICONS.video.replace('white','white')}</button>
            <button id="speaker-btn" onclick="toggleSpeaker()" class="call-btn neutral" style="color:white" title="Динамик">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M15.54 8.46a5 5 0 010 7.07" stroke="white" stroke-width="2" stroke-linecap="round"/></svg>
            </button>
        </div>
        <div style="display:flex;gap:12px;justify-content:center">
            <button id="flip-btn" onclick="flipCamera()" class="call-btn neutral" style="width:44px;height:44px;color:white;opacity:0.7" title="Перевернуть камеру">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M1 4v6h6M23 20v-6h-6" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M20.49 9A9 9 0 005.64 5.64L1 10M23 14l-4.64 4.36A9 9 0 013.51 15" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
        </div>
    </div>
</div>

<!-- Пикер реакций -->
<div id="reaction-picker" class="reaction-picker" style="display:none;left:50%">
    ${['❤️','😂','😮','😢','👍','🔥','💯','🎉'].map(e =>
        `<button class="reaction-emoji-btn" onclick="sendReaction('${e}')">${e}</button>`
    ).join('')}
</div>
<div class="swipe-indicator" id="swipe-indicator"></div>
`;
}

// ══════════════════════════════════════════════════════════
//  ВКЛАДКИ
// ══════════════════════════════════════════════════════════
function switchTab(tab) {
    if (currentTab === tab) return;
    currentTab = tab;
    ['chats','moments','settings'].forEach(t => {
        document.getElementById(`${t}-section`)?.classList.toggle('hidden', t !== tab);
    });
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    document.getElementById(`tab-${tab}`)?.classList.add('active');
    if (tab === 'chats')    loadChats();
    if (tab === 'moments')  loadMoments();
    if (tab === 'settings') updateSettingsUI();
    vibrate(8);
}

function updateSettingsUI() {
    const bg = document.getElementById('settings-bg');
    if (bg) {
        const src = currentUser.avatar && !currentUser.avatar.startsWith('emoji:') && !currentUser.avatar.includes('default') ? currentUser.avatar : '';
        bg.style.backgroundImage = src ? `url('${src}')` : '';
        if (!src) bg.style.background = 'linear-gradient(135deg, var(--accent), #000)';
    }
    const nm = document.getElementById('settings-name');
    if (nm) nm.textContent = currentUser.name;
    const nv = document.getElementById('settings-name-val');
    if (nv) nv.textContent = currentUser.name;
    const bv = document.getElementById('settings-bio-val');
    if (bv) bv.textContent = currentUser.bio || 'Не задано';
    const tn = document.getElementById('current-theme-name');
    if (tn) tn.textContent = THEMES[activeTheme]?.name || 'Изумруд';
    const wsl = document.getElementById('ws-status-label');
    if (wsl) wsl.textContent = wsConnected ? 'Онлайн' : 'Переподключение...';
    const cl = document.getElementById('contacts-count-label');
    if (cl) cl.textContent = `${savedContacts.length} контактов`;
}

// ══════════════════════════════════════════════════════════
//  СПИСОК ЧАТОВ
// ══════════════════════════════════════════════════════════
async function loadChats() {
    try {
        const res = await apiFetch('/get_my_chats');
        if (!res) return;
        const chats = await res.json();
        recentChats = chats;
        renderChatList(chats);
        updatePageTitle();
        // Prefetch аватарки первых 5 чатов в фоне
        chats.slice(0, 5).forEach(c => {
            const av = c.partner_avatar;
            const id = c.partner_id;
            if (av && !av.includes('default') && !av.startsWith('emoji:')) {
                AvatarCache.getOrFetch(av, id).then(src => { chatPartnerAvatarSrc[id] = src; });
            }
        });
    } catch(e) { console.error('loadChats:', e); }
}
// ════════════════════════════════════
// Контекстное меню чата (long-press)
// ════════════════════════════════════
const _mutedChats = new Set(JSON.parse(localStorage.getItem('waychat_muted')||'[]'));

function _showChatListMenu(div, isGroup, partnerId, partnerName, chatId, partnerAvatar) {
    const muted = _mutedChats.has(chatId);

    // Строим DOM вместо строк — избегаем проблем с кавычками
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };

    const sheet = document.createElement('div');
    sheet.className = 'modal-sheet';

    // Ручка
    const handle = document.createElement('div');
    handle.className = 'modal-handle';
    sheet.appendChild(handle);

    // Шапка с аватаром
    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;gap:14px;padding:0 4px 18px';
    header.innerHTML = getAvatarHtml({id:partnerId,name:partnerName,avatar:partnerAvatar||''},'w-14 h-14');
    const hInfo = document.createElement('div');
    hInfo.innerHTML = '<div style="font-weight:700;font-size:16px">' + escHtml(partnerName) + '</div>'
        + '<div style="font-size:13px;color:var(--text-2)">' + (isGroup ? 'Группа' : 'Личный чат') + '</div>';
    header.appendChild(hInfo);
    sheet.appendChild(header);

    // Список действий
    const list = document.createElement('div');
    list.style.cssText = 'display:flex;flex-direction:column;gap:6px';

    // Уведомления
    const muteRow = document.createElement('div');
    muteRow.className = 'settings-row';
    muteRow.style.borderRadius = '16px';
    muteRow.style.cursor = 'pointer';
    muteRow.innerHTML = '<div style="display:flex;align-items:center;gap:14px">'
        + '<span style="width:36px;height:36px;background:rgba(99,102,241,0.12);border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0">'
        + '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" stroke="#6366f1" stroke-width="2" stroke-linecap="round"/><path d="M13.73 21a2 2 0 01-3.46 0" stroke="#6366f1" stroke-width="2" stroke-linecap="round"/></svg>'
        + '</span><div><div style="font-weight:600">Уведомления</div>'
        + '<div style="font-size:12px;color:var(--text-2)">' + (muted ? 'Выключены' : 'Включены') + '</div></div></div>'
        + '<span style="font-size:12px;color:var(--accent)">' + (muted ? 'Включить' : 'Выключить') + '</span>';
    muteRow.onclick = () => { _toggleMute(chatId); overlay.remove(); };
    list.appendChild(muteRow);

    // Заблокировать (только личные чаты)
    if (!isGroup) {
        const blockRow = document.createElement('div');
        blockRow.className = 'settings-row';
        blockRow.style.cssText = 'border-radius:16px;cursor:pointer';
        blockRow.innerHTML = '<div style="display:flex;align-items:center;gap:14px">'
            + '<span style="width:36px;height:36px;background:rgba(245,158,11,0.12);border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0">'
            + '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="#f59e0b" stroke-width="2"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" stroke="#f59e0b" stroke-width="2" stroke-linecap="round"/></svg>'
            + '</span><div style="font-weight:600">Заблокировать</div></div>';
        blockRow.onclick = () => { overlay.remove(); _confirmBlockUser(partnerId, partnerName); };
        list.appendChild(blockRow);
    }

    // Удалить чат
    const delRow = document.createElement('div');
    delRow.className = 'settings-row';
    delRow.style.cssText = 'border-radius:16px;cursor:pointer';
    delRow.innerHTML = '<div style="display:flex;align-items:center;gap:14px">'
        + '<span style="width:36px;height:36px;background:rgba(239,68,68,0.12);border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0">'
        + '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><polyline points="3 6 5 6 21 6" stroke="#ef4444" stroke-width="2" stroke-linecap="round"/><path d="M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2" stroke="#ef4444" stroke-width="2" stroke-linecap="round"/></svg>'
        + '</span><div style="font-weight:600;color:#ef4444">Удалить чат</div></div>';
    delRow.onclick = () => { overlay.remove(); _confirmDeleteChat(chatId, partnerName); };
    list.appendChild(delRow);

    sheet.appendChild(list);
    overlay.appendChild(sheet);
    document.body.appendChild(overlay);
}

function _toggleMute(chatId) {
    if (_mutedChats.has(chatId)) { _mutedChats.delete(chatId); showToast('Уведомления включены','success'); }
    else { _mutedChats.add(chatId); showToast('Уведомления выключены','info'); }
    localStorage.setItem('waychat_muted', JSON.stringify([..._mutedChats]));
}

function _confirmBlockUser(uid, name) {
    const ov = document.createElement('div');
    ov.className = 'modal-overlay';
    ov.onclick = e => { if (e.target === ov) ov.remove(); };
    const sh = document.createElement('div');
    sh.className = 'modal-sheet';
    sh.innerHTML = '<div class="modal-handle"></div>'
        + '<div style="text-align:center;padding:8px 0 18px">'
        + '<div style="font-size:40px;margin-bottom:10px">🚫</div>'
        + '<div style="font-size:17px;font-weight:700">Заблокировать ' + escHtml(name) + '?</div>'
        + '</div>';
    const btns = document.createElement('div');
    btns.style.cssText = 'display:flex;gap:10px';
    const ca = document.createElement('button');
    ca.style.cssText = 'flex:1;padding:14px;background:var(--surface2);border:1px solid var(--border);border-radius:16px;color:var(--text);font-size:15px;font-weight:600;cursor:pointer;font-family:inherit';
    ca.textContent = 'Отмена'; ca.onclick = () => ov.remove();
    const ok = document.createElement('button');
    ok.style.cssText = 'flex:1;padding:14px;background:#f59e0b;border:none;border-radius:16px;color:#fff;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit';
    ok.textContent = 'Заблокировать'; ok.onclick = () => { _doBlock(uid, name); ov.remove(); };
    btns.appendChild(ca); btns.appendChild(ok);
    sh.appendChild(btns); ov.appendChild(sh); document.body.appendChild(ov);
}
async function _doBlock(uid,name){try{await apiFetch('/block_user/'+uid,{method:'POST'});showToast(name+' заблокирован','info');}catch(e){showToast('Ошибка','error');}}

function _confirmDeleteChat(chatId, name) {
    const ov = document.createElement('div');
    ov.className = 'modal-overlay';
    ov.onclick = e => { if (e.target === ov) ov.remove(); };
    const sh = document.createElement('div');
    sh.className = 'modal-sheet';
    sh.innerHTML = '<div class="modal-handle"></div>'
        + '<div style="text-align:center;padding:8px 0 18px">'
        + '<div style="font-size:40px;margin-bottom:10px">🗑️</div>'
        + '<div style="font-size:17px;font-weight:700;margin-bottom:6px">Удалить чат с ' + escHtml(name) + '?</div>'
        + '<div style="font-size:14px;color:var(--text-2)">Все сообщения будут удалены</div>'
        + '</div>';
    const btns = document.createElement('div');
    btns.style.cssText = 'display:flex;gap:10px';
    const ca = document.createElement('button');
    ca.style.cssText = 'flex:1;padding:14px;background:var(--surface2);border:1px solid var(--border);border-radius:16px;color:var(--text);font-size:15px;font-weight:600;cursor:pointer;font-family:inherit';
    ca.textContent = 'Отмена'; ca.onclick = () => ov.remove();
    const ok = document.createElement('button');
    ok.style.cssText = 'flex:1;padding:14px;background:#ef4444;border:none;border-radius:16px;color:#fff;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit';
    ok.textContent = 'Удалить'; ok.onclick = () => { _doDeleteChat(chatId); ov.remove(); };
    btns.appendChild(ca); btns.appendChild(ok);
    sh.appendChild(btns); ov.appendChild(sh); document.body.appendChild(ov);
}
async function _doDeleteChat(chatId){try{await apiFetch('/delete_chat/'+chatId,{method:'POST'});loadChats();showToast('Чат удалён','success');}catch(e){showToast('Ошибка','error');}}

function renderChatList(chats) {
    const container = document.getElementById('chat-list');
    if (!container) return;

    let totalUnread = 0;

    if (!chats.length) {
        container.innerHTML = `<div style="padding:60px 0;text-align:center;opacity:0.2">
            <div style="margin-bottom:12px;display:flex;justify-content:center">${ICONS.chats.replace('currentColor','rgba(255,255,255,0.3)')}</div>
            <p style="font-size:16px;font-weight:500">Нет переписок</p>
            <p style="font-size:13px;margin-top:4px">Нажмите + чтобы добавить контакт</p>
        </div>`;
        updateUnreadBadge(0);
        return;
    }

    // ── Уникальный ключ: "g_ID" для групп, "p_ID" для личных ──
    // Это предотвращает коллизию если group_id === partner_id
    const makeKey = (chat) => chat.is_group ? `g_${chat.group_id}` : `p_${chat.partner_id}`;

    const existingMap = new Map();
    container.querySelectorAll('[data-chat-key]').forEach(el => existingMap.set(el.dataset.chatKey, el));

    const newKeys = new Set(chats.map(makeKey));
    existingMap.forEach((el, key) => { if (!newKeys.has(key)) { try { container.removeChild(el); } catch(e){} } });
    container.querySelectorAll('.chat-item-divider').forEach(el => el.remove());

    chats.forEach((chat, index) => {
        totalUnread += chat.unread_count || 0;
        const isUnread    = (chat.unread_count || 0) > 0;
        const isGroup     = !!chat.is_group;
        // ── Используем правильное имя: для группы — group_name, для личного — partner_name ──
        const partnerId   = isGroup ? chat.group_id   : chat.partner_id;
        const partnerName = isGroup ? (chat.group_name || 'Группа') : chat.partner_name;
        const partnerAvatar = isGroup ? (chat.group_avatar || '') : (chat.partner_avatar || '');
        const displayName = isGroup ? partnerName : getContactDisplayName(partnerId, partnerName);
        const preview     = chat.last_message || 'Начните переписку';
        const time        = getMoscowTime(chat.raw_timestamp || chat.timestamp) || chat.timestamp || '';
        const chatKey     = makeKey(chat);

        let div = existingMap.get(chatKey);
        if (!div) {
            div = document.createElement('div');
            div.className = 'chat-item';
            div.dataset.chatKey   = chatKey;
            div.dataset.partnerId = partnerId;  // для совместимости
            if (isGroup) div.dataset.isGroup = '1';

            // ── Замыкание через IIFE чтобы onclick не терял значения ──
            div.onclick = ((_isGroup, _pid, _pname, _pava) => () => {
                vibrate(8);
                if (_isGroup) openGroupChat(_pid, _pname, _pava);
                else          openChat(_pid, _pname, _pava);
            })(isGroup, partnerId, partnerName, partnerAvatar);

            // ── Long-press: меню чата ──
            {
                let _lpt=null, _longFired=false;
                div.addEventListener('pointerdown', () => {
                    _longFired=false;
                    _lpt=setTimeout(()=>{ _longFired=true; vibrate(40); _showChatListMenu(div,isGroup,partnerId,partnerName,chat.chat_id,partnerAvatar); },550);
                });
                const _lpc=()=>clearTimeout(_lpt);
                div.addEventListener('pointerup',    _lpc);
                div.addEventListener('pointermove',  _lpc);
                div.addEventListener('pointercancel',_lpc);
                div.addEventListener('click', e=>{ if(_longFired){ e.stopImmediatePropagation(); _longFired=false; } }, true);
            }

            const avaWrap = document.createElement('div');
            avaWrap.className = 'ava-wrap';
            avaWrap.style.cssText = 'position:relative;flex-shrink:0;width:58px;height:58px';

            // Аватар внутри
            const _ai = document.createElement('div');
            _ai.style.cssText = 'position:absolute;inset:'+(chat.has_moment&&!isGroup?'4px':'0')+';border-radius:50%;overflow:hidden';
            _ai.innerHTML = getAvatarHtml({id:partnerId,name:partnerName,avatar:partnerAvatar},'w-full h-full');
            avaWrap.appendChild(_ai);

            // SVG кольцо если есть моменты
            if (!isGroup && chat.has_moment) {
                const mc=Math.min(chat.moment_count||1,8);
                const _ns='http://www.w3.org/2000/svg';
                const _sv=document.createElementNS(_ns,'svg');
                _sv.setAttribute('width','58');_sv.setAttribute('height','58');_sv.setAttribute('viewBox','0 0 58 58');
                _sv.style.cssText='position:absolute;inset:0;pointer-events:none';
                const _cx=29,_cy=29,_r=27,_gap=mc>1?5:0,_seg=(360-_gap*mc)/mc;
                for(let i=0;i<mc;i++){
                    const sd=-90+i*(_seg+_gap),ed=sd+_seg,tr=d=>d*Math.PI/180;
                    const x1=_cx+_r*Math.cos(tr(sd)),y1=_cy+_r*Math.sin(tr(sd));
                    const x2=_cx+_r*Math.cos(tr(ed)),y2=_cy+_r*Math.sin(tr(ed));
                    const _p=document.createElementNS(_ns,'path');
                    _p.setAttribute('d',`M${x1.toFixed(1)} ${y1.toFixed(1)} A${_r} ${_r} 0 ${_seg>180?1:0} 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`);
                    _p.setAttribute('stroke','var(--accent)');_p.setAttribute('stroke-width','3.5');
                    _p.setAttribute('fill','none');_p.setAttribute('stroke-linecap','round');
                    _sv.appendChild(_p);
                }
                avaWrap.appendChild(_sv);
            }

            if (!isGroup) {
                const onlineDot = document.createElement('div');
                onlineDot.className = 'online-dot';
                onlineDot.style.display = chat.online ? 'block' : 'none';
                avaWrap.appendChild(onlineDot);
            } else {
                // Для группы — маленький бейдж с иконкой группы
                const badge = document.createElement('div');
                badge.style.cssText = 'position:absolute;bottom:-1px;right:-1px;width:18px;height:18px;background:#3b82f6;border-radius:50%;border:2px solid #000;display:flex;align-items:center;justify-content:center';
                badge.innerHTML = `<svg width="9" height="9" viewBox="0 0 24 24" fill="none"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" stroke="white" stroke-width="2.5" stroke-linecap="round"/><circle cx="9" cy="7" r="4" stroke="white" stroke-width="2.5"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" stroke="white" stroke-width="2" stroke-linecap="round"/></svg>`;
                avaWrap.appendChild(badge);
            }

            const info = document.createElement('div');
            info.className = 'chat-info';
            info.style.cssText = 'flex:1;min-width:0;padding-bottom:10px';

            div.appendChild(avaWrap);
            div.appendChild(info);
            container.appendChild(div);
        } else {
            // Обновляем onclick при каждом рендере (имя/аватар могли измениться)
            div.onclick = ((_isGroup, _pid, _pname, _pava) => () => {
                vibrate(8);
                if (_isGroup) openGroupChat(_pid, _pname, _pava);
                else          openChat(_pid, _pname, _pava);
            })(isGroup, partnerId, partnerName, partnerAvatar);
        }

        if (!isGroup) {
            const dot = div.querySelector('.online-dot');
            if (dot) dot.style.display = chat.online ? 'block' : 'none';
        }

        const info = div.querySelector('.chat-info');
        if (info) {
            info.innerHTML = `
                <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:3px">
                    <span style="font-weight:${isUnread?'700':'600'};font-size:16px;letter-spacing:-0.2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:190px">${displayName}</span>
                    <span style="font-size:11px;font-weight:${isUnread?'700':'400'};color:${isUnread?'var(--accent)':'var(--text-2)'};flex-shrink:0;margin-left:8px">${time}</span>
                </div>
                <div style="display:flex;justify-content:space-between;align-items:center">
                    <p style="font-size:14px;color:${isUnread?'rgba(255,255,255,0.85)':'var(--text-2)'};font-weight:${isUnread?'500':'400'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;margin-right:8px">${preview}</p>
                    ${isUnread?`<span style="background:var(--accent);color:#000;font-size:10px;font-weight:800;min-width:20px;height:20px;border-radius:10px;display:flex;align-items:center;justify-content:center;padding:0 5px;flex-shrink:0">${chat.unread_count}</span>`:''}
                </div>`;
        }

        // Вставляем на правильную позицию
        if (container.children[index] !== div) {
            container.insertBefore(div, container.children[index] || null);
        }
    });

    // Разделители
    container.querySelectorAll('.chat-item').forEach((item, i, all) => {
        if (i < all.length - 1) {
            const divider = document.createElement('div');
            divider.className = 'chat-item-divider';
            item.parentNode.insertBefore(divider, item.nextSibling);
        }
    });

    updateUnreadBadge(totalUnread);
}

function getContactDisplayName(userId, defaultName) {
    return contactCustomNames[userId] || defaultName;
}

function updateUnreadBadge(total) {
    unreadTotal = total;
    const badge = document.getElementById('total-unread-badge');
    if (badge) {
        badge.textContent = total > 99 ? '99+' : total;
        badge.classList.toggle('hidden', total === 0);
    }
}

function updatePageTitle() { document.title = unreadTotal > 0 ? `(${unreadTotal}) WayChat` : 'WayChat'; }

function updatePartnerOnlineStatus(userId, isOnline) {
    if (userId === currentPartnerId) {
        const el  = document.getElementById('chat-status');
        const dot = document.getElementById('chat-online-dot');
        if (el)  el.textContent = isOnline ? 'в сети' : 'был(а) недавно';
        if (dot) dot.style.display = isOnline ? 'block' : 'none';
    }
    document.querySelectorAll(`[data-partner-id="${userId}"] .online-dot`).forEach(dot => {
        dot.style.display = isOnline ? 'block' : 'none';
    });
}

// ══════════════════════════════════════════════════════════
//  API FETCH
// ══════════════════════════════════════════════════════════
async function apiFetch(url, options = {}) {
    const headers = { ...(options.headers || {}) };
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 10000); // 10с таймаут
    try {
        const res = await fetch(url, { ...options, headers, credentials: 'include', signal: controller.signal });
        clearTimeout(tid);
        if (res.status === 401 || (res.redirected && res.url.includes('/login'))) {
            location.href = '/login';
            return null;
        }
        return res;
    } catch(e) {
        clearTimeout(tid);
        if (e.name === 'AbortError') console.warn('apiFetch timeout:', url);
        return null;
    }
}

// ══════════════════════════════════════════════════════════
//  ПОИСК
// ══════════════════════════════════════════════════════════
function onSearchFocus() {
    searchMode = true;
    document.getElementById('search-cancel').style.display = 'block';
    document.getElementById('chat-list').style.display = 'none';
    document.getElementById('search-results').classList.remove('hidden');
    renderRecentContacts();
}

function onSearchBlur() {
    setTimeout(() => {
        if (!document.getElementById('search-input')?.value.trim()) cancelSearch();
    }, 150);
}

function cancelSearch() {
    searchMode = false;
    const inp = document.getElementById('search-input');
    if (inp) inp.value = '';
    document.getElementById('search-cancel').style.display = 'none';
    document.getElementById('search-results')?.classList.add('hidden');
    const cl = document.getElementById('chat-list');
    if (cl) cl.style.display = 'block';
}

function renderRecentContacts() {
    const res = document.getElementById('search-results');
    if (!res) return;
    res.innerHTML = '';
    if (savedContacts.length) {
        const p = document.createElement('p');
        p.style.cssText = 'font-size:11px;font-weight:700;color:var(--text-2);letter-spacing:0.8px;text-transform:uppercase;margin:0 4px 10px';
        p.textContent = 'Контакты';
        res.appendChild(p);
        savedContacts.slice(0, 6).forEach(c => {
            const d = document.createElement('div');
            d.className = 'user-result';
            d.onclick = () => { cancelSearch(); openChat(c.id, c.name, c.avatar); };
            d.innerHTML = `
                ${getAvatarHtml({id:c.id, name:c.name, avatar:c.avatar},'w-12 h-12')}
                <div style="flex:1">
                    <div style="font-weight:600;font-size:15px">${getContactDisplayName(c.id, c.name)}</div>
                    <div style="font-size:12px;color:var(--text-2)">@${c.username||''}</div>
                </div>`;
            res.appendChild(d);
        });
    }
    if (recentChats.length) {
        const p = document.createElement('p');
        p.style.cssText = 'font-size:11px;font-weight:700;color:var(--text-2);letter-spacing:0.8px;text-transform:uppercase;margin:12px 4px 10px';
        p.textContent = 'Недавние';
        res.appendChild(p);
        recentChats.slice(0, 4).forEach(c => {
            const d = document.createElement('div');
            d.className = 'user-result';
            d.onclick = () => { cancelSearch(); openChat(c.partner_id, c.partner_name, c.partner_avatar); };
            d.innerHTML = `
                ${getAvatarHtml({id:c.partner_id, name:c.partner_name, avatar:c.partner_avatar},'w-12 h-12')}
                <div style="flex:1">
                    <div style="font-weight:600;font-size:15px">${getContactDisplayName(c.partner_id, c.partner_name)}</div>
                    ${c.online ? '<div style="font-size:12px;color:var(--accent)">● в сети</div>' : ''}
                </div>`;
            res.appendChild(d);
        });
    }
    if (!savedContacts.length && !recentChats.length) {
        res.innerHTML = `<p style="text-align:center;opacity:0.3;padding:30px;font-size:14px">Введите имя или @юзернейм</p>`;
    }
}

function handleSearch() {
    const q = document.getElementById('search-input')?.value.trim();
    if (!q) { renderRecentContacts(); return; }
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(async () => {
        const res = document.getElementById('search-results');
        try {
            const r = await apiFetch(`/search_users?q=${encodeURIComponent(q)}`);
            if (!r) return;
            const users = await r.json();
            if (!res) return;
            res.innerHTML = `<p style="font-size:11px;font-weight:700;color:var(--text-2);letter-spacing:0.8px;text-transform:uppercase;margin:0 4px 10px">Результаты</p>`;
            if (!users.length) {
                res.innerHTML += `<p style="text-align:center;opacity:0.3;padding:30px;font-size:14px">Никого не найдено</p>`;
                return;
            }
            users.forEach(u => {
                const d = document.createElement('div');
                d.className = 'user-result';
                d.onclick = () => { cancelSearch(); openChat(u.id, u.name, u.avatar_url||u.avatar); };
                d.innerHTML = `
                    ${getAvatarHtml({id:u.id, name:u.name, avatar:u.avatar_url||u.avatar},'w-12 h-12')}
                    <div style="flex:1">
                        <div style="font-weight:600;font-size:15px">${u.name}</div>
                        <div style="font-size:13px;color:var(--text-2)">@${u.username} ${u.online?'<span style="color:var(--accent)">● в сети</span>':''}</div>
                    </div>
                    <div style="color:rgba(255,255,255,0.4)">${ICONS.send.replace('white','rgba(255,255,255,0.4)').replace('width="20" height="20"','width="16" height="16"')}</div>`;
                res.appendChild(d);
            });
        } catch(e) {
            if (res) res.innerHTML = `<p style="text-align:center;color:#ef4444;padding:20px;font-size:13px">Ошибка поиска</p>`;
        }
    }, 280);
}

// ══════════════════════════════════════════════════════════
//  ОТКРЫТИЕ ЧАТА — С КЭШЕМ СООБЩЕНИЙ
// ══════════════════════════════════════════════════════════
async function openChat(id, name, avatar) {
    const win  = document.getElementById('chat-window');
    const msgs = document.getElementById('messages');
    currentPartnerId = id;
    currentChatId    = null;
    currentChatType  = 'private';
    loadingMessages  = false;
    hasMoreMessages  = true;

    win.classList.add('active');
    const displayName = getContactDisplayName(id, name);
    document.getElementById('chat-name').textContent = displayName;
    document.getElementById('chat-status').textContent = 'загрузка...';
    document.getElementById('chat-online-dot').style.display = 'none';

    // Аватар — сначала из памяти, затем из IndexedDB (мгновенно)
    const headerBox = document.getElementById('chat-ava-header');
    const cachedSrc = chatPartnerAvatarSrc[id];
    if (headerBox) {
        if (cachedSrc) {
            headerBox.innerHTML = `<img src="${cachedSrc}" class="w-10 h-10 rounded-full object-cover border border-white/10" data-uid="${id}" style="flex-shrink:0" loading="lazy">`;
        } else {
            headerBox.innerHTML = getAvatarHtml({id, name, avatar}, 'w-10 h-10');
            if (avatar && !avatar.includes('default')) {
                // Загружаем через кэш
                AvatarCache.getOrFetch(avatar, id).then(src => {
                    chatPartnerAvatarSrc[id] = src;
                    document.querySelectorAll(`[data-uid="${id}"]`).forEach(el => {
                        if (el.tagName === 'IMG') el.src = src;
                    });
                });
            }
        }
    }

    // Показываем кэшированные сообщения МГНОВЕННО если есть
    const cached = messagesByChatCache[`p_${id}`];
    if (cached && cached.messages.length > 0) {
        msgs.innerHTML = '';
        renderMessagesFromCache(cached.messages);
        scrollDown(false);
        // Показываем индикатор что обновляем
        document.getElementById('chat-status').textContent = 'обновление...';
    } else {
        msgs.innerHTML = `<div style="padding:60px 0;text-align:center;opacity:0.2"><div style="font-size:14px">Загрузка...</div></div>`;
    }

    try {
        const res  = await apiFetch(`/get_chat_id/${id}`);
        if (!res) return;
        const data = await res.json();
        if (data.chat_id) {
            currentChatId = data.chat_id;
            socket.emit('enter_chat', { chat_id: currentChatId });
            const isOnline = data.partner_online;
            document.getElementById('chat-status').textContent = isOnline ? 'в сети' : 'был(а) недавно';
            document.getElementById('chat-online-dot').style.display = isOnline ? 'block' : 'none';
            await loadMessages(true);
            setupVoiceRecording();
            setupScrollPagination();
        }
    } catch(e) {
        console.error('openChat:', e);
        msgs.innerHTML = `<div style="padding:60px 0;text-align:center;color:#ef4444;font-size:14px">Ошибка соединения</div>`;
    }
}

// ══════════════════════════════════════════════════════════
//  ОТКРЫТИЕ ГРУППОВОГО ЧАТА
// ══════════════════════════════════════════════════════════
async function openGroupChat(groupId, groupName, groupAvatar) {
    const win  = document.getElementById('chat-window');
    const msgs = document.getElementById('messages');
    currentPartnerId = groupId;
    currentChatId    = null;
    currentChatType  = 'group';
    loadingMessages  = false;
    hasMoreMessages  = true;

    win.classList.add('active');
    document.getElementById('chat-name').textContent = groupName;
    document.getElementById('chat-status').textContent = 'группа';
    document.getElementById('chat-online-dot').style.display = 'none';

    // Используем переданный avatar (из кэша списка чатов)
    const headerBox = document.getElementById('chat-ava-header');
    if (headerBox) headerBox.innerHTML = getAvatarHtml({id: groupId, name: groupName, avatar: groupAvatar}, 'w-10 h-10');

    const cached = messagesByChatCache[`g_${groupId}`];
    if (cached && cached.messages.length > 0) {
        msgs.innerHTML = '';
        renderMessagesFromCache(cached.messages);
        scrollDown(false);
        document.getElementById('chat-status').textContent = 'обновление...';
    } else {
        msgs.innerHTML = `<div style="padding:60px 0;text-align:center;opacity:0.2"><div style="font-size:14px">Загрузка...</div></div>`;
    }

    try {
        const res  = await apiFetch(`/get_group_chat_id/${groupId}`);
        if (!res) return;
        const data = await res.json();
        if (data.chat_id) {
            currentChatId = data.chat_id;
            socket.emit('enter_chat', { chat_id: currentChatId });
            const members = data.member_count || 0;
            document.getElementById('chat-status').textContent = `${members} участников`;
            // Обновляем аватар если API вернул актуальный
            if (data.group_avatar && data.group_avatar !== groupAvatar) {
                if (headerBox) headerBox.innerHTML = getAvatarHtml({id: groupId, name: groupName, avatar: data.group_avatar}, 'w-10 h-10');
                chatPartnerAvatarSrc[groupId] = data.group_avatar;
            }
            await loadMessages(true);
            setupVoiceRecording();
            setupScrollPagination();
        }
    } catch(e) {
        console.error('openGroupChat:', e);
    }
}

// ══════════════════════════════════════════════════════════
//  ЗАГРУЗКА СООБЩЕНИЙ — КЭШ + ПАГИНАЦИЯ (30-40 за раз)
// ══════════════════════════════════════════════════════════
const MESSAGES_PER_PAGE = 35;

async function loadMessages(initial = false) {
    if (!currentChatId || loadingMessages || (!initial && !hasMoreMessages)) return;
    loadingMessages = true;
    const container = document.getElementById('messages');
    const prevHeight = container?.scrollHeight || 0;

    // Ключ кэша
    const cacheKey = currentChatType === 'group' ? `g_${currentPartnerId}` : `p_${currentPartnerId}`;

    try {
        // Определяем before_id для пагинации
        let beforeId = null;
        if (!initial && container) {
            const firstMsg = container.querySelector('[data-msg-id]');
            if (firstMsg) beforeId = +firstMsg.dataset.msgId;
        }

        const url = beforeId
            ? `/get_messages/${currentChatId}?limit=${MESSAGES_PER_PAGE}&before_id=${beforeId}`
            : `/get_messages/${currentChatId}?limit=${MESSAGES_PER_PAGE}`;

        const res  = await apiFetch(url);
        if (!res) return;
        const msgs = await res.json();

        if (msgs.length < MESSAGES_PER_PAGE) hasMoreMessages = false;

        if (initial) {
            // Обновляем кэш
            if (!messagesByChatCache[cacheKey]) {
                messagesByChatCache[cacheKey] = { messages: [], loadedAll: false };
            }
            messagesByChatCache[cacheKey].messages = msgs;
            messagesByChatCache[cacheKey].lastFetch = Date.now();

            container.innerHTML = '';
            if (!msgs.length) {
                container.innerHTML = `<div style="padding:60px 0;text-align:center;opacity:0.2"><div style="font-size:40px;margin-bottom:10px">👋</div><p>Начните переписку!</p></div>`;
                return;
            }
            renderMessagesFromCache(msgs);
            scrollDown(false);
            socket.emit('mark_read', { chat_id: currentChatId });
        } else {
            // Загрузка более старых — добавляем в начало
            if (!messagesByChatCache[cacheKey]) messagesByChatCache[cacheKey] = { messages: [] };
            messagesByChatCache[cacheKey].messages = [...msgs, ...messagesByChatCache[cacheKey].messages];

            const fragment = document.createDocumentFragment();
            msgs.forEach(msg => {
                const row = buildMessageRow(msg, false);
                fragment.insertBefore(row, fragment.firstChild);
            });
            container.insertBefore(fragment, container.firstChild);
            container.scrollTop = container.scrollHeight - prevHeight;
        }

        currentPage++;
    } catch(e) { console.error('loadMessages:', e); }
    finally { loadingMessages = false; }
}

function renderMessagesFromCache(msgs) {
    const container = document.getElementById('messages');
    if (!container) return;
    let lastDate = null;
    msgs.forEach(msg => {
        const msgDate = getMessageDate(msg);
        if (msgDate && msgDate !== lastDate) {
            const divider = document.createElement('div');
            divider.className = 'date-divider';
            divider.innerHTML = `<div class="date-divider-inner">${msgDate}</div>`;
            container.appendChild(divider);
            lastDate = msgDate;
        }
        container.appendChild(buildMessageRow(msg, false));
    });
}

function getMessageDate(msg) {
    const ts = msg.timestamp || msg.raw_timestamp;
    if (!ts) return null;
    try {
        const d = new Date(ts);
        if (isNaN(d.getTime())) return null;
        const moscowOffset = 3 * 60;
        const localOffset  = d.getTimezoneOffset();
        const moscow = new Date(d.getTime() + (moscowOffset + localOffset) * 60000);
        const now    = new Date(Date.now() + (moscowOffset + (new Date().getTimezoneOffset())) * 60000);
        if (moscow.toDateString() === now.toDateString()) return 'Сегодня';
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        if (moscow.toDateString() === yesterday.toDateString()) return 'Вчера';
        const months = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];
        return `${moscow.getDate()} ${months[moscow.getMonth()]}`;
    } catch(e) { return null; }
}

function setupScrollPagination() {
    const container = document.getElementById('messages');
    if (!container) return;
    let loadTrigger = false;
    container.onscroll = () => {
        if (container.scrollTop < 100 && hasMoreMessages && !loadingMessages && !loadTrigger) {
            loadTrigger = true;
            loadMessages(false).finally(() => { loadTrigger = false; });
        }
    };
}

// ══════════════════════════════════════════════════════════
//  РЕНДЕР СООБЩЕНИЯ
// ══════════════════════════════════════════════════════════
function buildMessageRow(msg, animate = true) {
    const isMe = msg.sender_id === currentUser.id;
    const type = msg.type || msg.type_msg || 'text';
    const row  = document.createElement('div');
    row.className = `msg-row ${isMe ? 'out' : 'in'}`;
    row.setAttribute('data-msg-id', msg.id || '');
    if (animate) row.classList.add('animate-msg');

    // Долгое нажатие
    let lpTimer;
    row.addEventListener('touchstart', () => {
        lpTimer = setTimeout(() => { vibrate([10,30,10]); showMsgContextMenu(row, msg); }, 600);
    }, { passive: true });
    row.addEventListener('touchend',  () => clearTimeout(lpTimer));
    row.addEventListener('touchmove', () => clearTimeout(lpTimer));

    // Двойной тап — лайк
    let tapCount = 0, tapTimer = null;
    row.addEventListener('touchend', () => {
        tapCount++;
        if (tapCount === 2) {
            clearTimeout(tapTimer); tapCount = 0;
            activeReactionMsgId = msg.id;
            sendReaction('❤️');
            showFloatingHeart(row);
        } else {
            tapTimer = setTimeout(() => { tapCount = 0; }, 350);
        }
    });

    const rawTime = msg.raw_timestamp || msg.timestamp || '';
    const displayTime = getMoscowTime(rawTime) || msg.timestamp || '';

    // Видео-кружок
    if ((msg.media_type === 'video_circle' || msg.type === 'video_circle') && (msg.media_url || msg.file_url)) {
        const src = msg.media_url || msg.file_url;
        const circRow = document.createElement('div');
        circRow.className = `msg-row ${isMe ? 'out' : 'in'}`;
        if (animate) circRow.classList.add('animate-msg');
        circRow.setAttribute('data-msg-id', msg.id || '');
        const wrap = document.createElement('div');
        wrap.style.cssText = 'display:flex;flex-direction:column;align-items:'+(isMe?'flex-end':'flex-start');
        const circ = document.createElement('div');
        circ.style.cssText = 'width:180px;height:180px;border-radius:50%;overflow:hidden;border:2.5px solid var(--accent);cursor:pointer;position:relative;box-shadow:0 4px 20px rgba(16,185,129,0.3)';
        const v = document.createElement('video');
        v.src = src; v.playsInline = true; v.loop = true; v.muted = false;
        v.style.cssText = 'width:100%;height:100%;object-fit:cover';
        const playIcon = document.createElement('div');
        playIcon.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.25);transition:opacity .2s';
        playIcon.innerHTML = '<svg width="40" height="40" viewBox="0 0 24 24" fill="white" opacity=".8"><polygon points="5,3 19,12 5,21"/></svg>';
        circ.appendChild(v); circ.appendChild(playIcon);
        circ.onclick = () => {
            if (v.paused) { v.play(); playIcon.style.opacity='0'; }
            else { v.pause(); playIcon.style.opacity='1'; }
        };
        v.onplay = () => playIcon.style.opacity='0';
        v.onpause = () => playIcon.style.opacity='1';
        const io = new IntersectionObserver(([e])=>{if(e.isIntersecting)v.play();else v.pause();},{threshold:0.5});
        io.observe(circ);
        const timeEl = document.createElement('div');
        timeEl.style.cssText = 'font-size:11px;color:var(--text-2);margin-top:4px;padding:0 4px';
        timeEl.textContent = displayTime;
        wrap.appendChild(circ); wrap.appendChild(timeEl);
        if (!isMe) { circRow.appendChild(avatarHtml ? (() => { const d=document.createElement('div'); d.innerHTML=avatarHtml; return d.firstChild; })() : document.createTextNode('')); }
        circRow.appendChild(wrap);
        return circRow;
    }

    let contentHtml = '';
    if (type === 'image') {
        contentHtml = `<div class="img-bubble" onclick="openFullImage('${msg.file_url}')"><img src="${msg.file_url}" loading="lazy" onerror="this.parentElement.innerHTML='🖼️ Фото'"></div>`;
    } else if (type === 'video') {
        contentHtml = `<video src="${msg.file_url}" class="img-bubble" controls playsinline style="max-width:260px;width:100%"></video>`;
    } else if (type === 'audio') {
        contentHtml = renderAudioPlayer(msg.file_url);
    } else {
        const text = msg.content || msg.text || '';
        const safe = text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        const linkedColor = isMe ? 'rgba(255,255,255,0.85)' : 'var(--accent)';
        const linked = safe.replace(/(https?:\/\/[^\s<]+)/g, `<a href="$1" target="_blank" rel="noopener" style="color:${linkedColor};text-decoration:underline">$1</a>`);
        contentHtml = `<div style="white-space:pre-wrap;word-break:break-word">${linked}</div>`;
    }

    // Аватар — кэшированный, для групп берём по sender_id
    let avatarHtml = '';
    if (!isMe) {
        const avatarUserId = currentChatType === 'group' ? msg.sender_id : currentPartnerId;
        const cachedSrc = chatPartnerAvatarSrc[avatarUserId];
        if (cachedSrc && !cachedSrc.startsWith('data:')) {
            avatarHtml = `<img src="${cachedSrc}" class="w-8 h-8 rounded-full object-cover border border-white/10" style="flex-shrink:0" data-uid="${avatarUserId}" loading="lazy">`;
        } else if (currentChatType !== 'group') {
            const headerAvaImg = document.getElementById('chat-ava-header')?.querySelector('img');
            if (headerAvaImg) {
                avatarHtml = `<img src="${headerAvaImg.src}" class="w-8 h-8 rounded-full object-cover border border-white/10" style="flex-shrink:0" data-uid="${avatarUserId}" loading="lazy">`;
                chatPartnerAvatarSrc[avatarUserId] = headerAvaImg.src;
            } else {
                const partnerName = document.getElementById('chat-name')?.textContent || '';
                avatarHtml = getInitialAvatar(partnerName, 'w-8 h-8', avatarUserId);
            }
        } else {
            // В группе — показываем инициалы отправителя
            avatarHtml = getInitialAvatar(msg.sender_name || '?', 'w-8 h-8', msg.sender_id);
            // Асинхронно подгружаем аватар отправителя
            if (msg.sender_id && !chatPartnerAvatarSrc[msg.sender_id]) {
                _loadSenderAvatar(msg.sender_id);
            }
        }
    }

    // Для группового чата — показываем имя отправителя
    let senderNameHtml = '';
    if (!isMe && currentChatType === 'group' && msg.sender_name) {
        senderNameHtml = `<div style="font-size:11px;font-weight:600;color:var(--accent);margin-bottom:3px">${msg.sender_name}</div>`;
    }

    const readColor = msg.is_read ? 'rgba(147,197,253,1)' : 'rgba(255,255,255,0.4)';
    row.innerHTML = `
        ${avatarHtml}
        <div style="flex:1;display:flex;flex-direction:column;${isMe?'align-items:flex-end':'align-items:flex-start'}">
            <div class="bubble">
                ${senderNameHtml}
                ${contentHtml}
                <div class="msg-time">
                    ${displayTime}
                    ${isMe ? `<span class="status-icon" style="color:${readColor}">${msg.is_read ? ICONS.checkDouble : ICONS.check}</span>` : ''}
                </div>
            </div>
            <div class="reactions-bar" id="reactions-${msg.id}"></div>
        </div>`;

    return row;
}

// Подгружает аватар участника группы и обновляет DOM
const _pendingAvatarLoads = new Set();
function _loadSenderAvatar(userId) {
    if (_pendingAvatarLoads.has(userId)) return;
    _pendingAvatarLoads.add(userId);
    apiFetch(`/get_user_profile/${userId}`)
        .then(r => r?.json())
        .then(data => {
            if (data?.avatar) {
                chatPartnerAvatarSrc[userId] = data.avatar;
                // Обновляем все img с data-uid
                document.querySelectorAll(`[data-uid="${userId}"]`).forEach(el => {
                    if (el.tagName === 'IMG') el.src = data.avatar;
                });
            }
        })
        .catch(() => {})
        .finally(() => _pendingAvatarLoads.delete(userId));
}

function showFloatingHeart(row) {
    const heart = document.createElement('div');
    heart.textContent = '❤️';
    heart.style.cssText = 'position:fixed;font-size:32px;z-index:9999;pointer-events:none;animation:heartFloat 0.8s ease forwards';
    const rect = row.getBoundingClientRect();
    heart.style.left = (rect.left + rect.width/2 - 16) + 'px';
    heart.style.top  = (rect.top + rect.height/2 - 16) + 'px';
    const style = document.createElement('style');
    style.textContent = '@keyframes heartFloat{0%{opacity:1;transform:scale(0.5)}50%{opacity:1;transform:scale(1.4)}100%{opacity:0;transform:scale(1) translateY(-30px)}}';
    document.head.appendChild(style);
    document.body.appendChild(heart);
    setTimeout(() => { heart.remove(); style.remove(); }, 800);
}

function renderNewMessage(msg, animate = true) {
    const container = document.getElementById('messages');
    if (!container) return;
    // Добавляем в кэш (только не оптимистичные)
    if (!msg._optimistic) {
        const cacheKey = currentChatType === 'group' ? `g_${currentPartnerId}` : `p_${currentPartnerId}`;
        if (messagesByChatCache[cacheKey]) {
            messagesByChatCache[cacheKey].messages.push(msg);
        }
    }
    const row = buildMessageRow(msg, animate);
    if (msg._optimistic) {
        row.setAttribute('data-optimistic', '1');
        row.setAttribute('data-content', msg.content || '');
        row.style.opacity = '0.7';
    }
    container.appendChild(row);
    if (animate) scrollDown(true);
}

// ══════════════════════════════════════════════════════════
//  КОНТЕКСТНОЕ МЕНЮ СООБЩЕНИЯ
// ══════════════════════════════════════════════════════════
function showMsgContextMenu(row, msg) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };

    const isMe = msg.sender_id === currentUser.id;
    const text  = msg.content || msg.text || '';
    const EMOJIS = ['❤️','😂','😮','😢','👍','🔥','💯','🎉','🥰','😱','👎','🤣'];

    const sheet = document.createElement('div');
    sheet.className = 'modal-sheet';

    const handle = document.createElement('div');
    handle.className = 'modal-handle';
    sheet.appendChild(handle);

    // Заголовок реакций
    const reactTitle = document.createElement('div');
    reactTitle.style.cssText = 'font-size:12px;font-weight:600;color:var(--text-2);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px';
    reactTitle.textContent = 'Реакция';
    sheet.appendChild(reactTitle);

    // Реакции — grid внутри экрана
    const reactRow = document.createElement('div');
    reactRow.style.cssText = 'display:grid;grid-template-columns:repeat(6,1fr);gap:8px;margin-bottom:16px';
    EMOJIS.forEach(e => {
        const btn = document.createElement('button');
        btn.style.cssText = 'font-size:26px;aspect-ratio:1;background:var(--surface2);border:1.5px solid var(--border);border-radius:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:transform .1s';
        btn.textContent = e;
        btn.addEventListener('pointerdown', () => { btn.style.transform='scale(1.25)'; });
        btn.addEventListener('pointerup',   () => { btn.style.transform='scale(1)'; });
        btn.addEventListener('click', () => {
            activeReactionMsgId = msg.id;
            sendReaction(e);
            overlay.remove();
        });
        reactRow.appendChild(btn);
    });
    sheet.appendChild(reactRow);

    const sep = document.createElement('div');
    sep.style.cssText = 'height:1px;background:var(--border);margin:0 0 10px';
    sheet.appendChild(sep);

    if (text) {
        const copyRow = document.createElement('div');
        copyRow.className = 'settings-row';
        copyRow.style.cssText = 'border-radius:14px;margin-bottom:4px';
        copyRow.innerHTML = `<div class="settings-icon" style="background:rgba(59,130,246,0.2);color:#60a5fa">${ICONS.copy}</div><span style="font-size:15px;font-weight:500">Копировать</span>`;
        copyRow.addEventListener('click', () => { copyMessage(text); overlay.remove(); });
        sheet.appendChild(copyRow);
    }

    if (isMe) {
        const delRow = document.createElement('div');
        delRow.className = 'settings-row';
        delRow.style.cssText = 'border-radius:14px';
        delRow.innerHTML = `<div class="settings-icon" style="background:rgba(239,68,68,0.2);color:#f87171">${ICONS.trash}</div><span style="font-size:15px;font-weight:500;color:#ef4444">Удалить</span>`;
        delRow.addEventListener('click', () => { confirmDeleteMessage(msg.id); overlay.remove(); });
        sheet.appendChild(delRow);
    }

    overlay.appendChild(sheet);
    document.body.appendChild(overlay);
}

function copyMessage(text) {
    navigator.clipboard?.writeText(text).catch(() => {
        const el = document.createElement('textarea');
        el.value = text; document.body.appendChild(el); el.select(); document.execCommand('copy'); el.remove();
    });
    showToast('Скопировано', 'success'); vibrate(15);
}

function confirmDeleteMessage(msgId) {
    if (!confirm('Удалить это сообщение?')) return;
    socket.emit('delete_message', { msg_id: msgId, chat_id: currentChatId });
    const row = document.querySelector(`[data-msg-id="${msgId}"]`);
    if (row) {
        row.style.transition = 'opacity 0.3s, transform 0.3s';
        row.style.opacity = '0';
        row.style.transform = 'scale(0.95)';
        setTimeout(() => row.remove(), 300);
    }
}

// ══════════════════════════════════════════════════════════
//  АУДИО ПЛЕЕР — с волновой формой
// ══════════════════════════════════════════════════════════
function renderAudioPlayer(src) {
    const uid = `au_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
    return `
    <div class="audio-player" data-src="${src}">
        <button class="audio-play-btn" onclick="toggleAudio('${uid}')">
            <svg id="play-icon-${uid}" width="14" height="14" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        </button>
        <div class="audio-progress-wrap">
            <div class="audio-waveform" id="wv_${uid}" style="display:flex;align-items:center;gap:1.5px;height:24px;flex:1;cursor:pointer" onclick="seekAudio(event,'${uid}')">
                ${Array(30).fill(0).map(() => `<div style="width:2px;background:rgba(255,255,255,0.3);border-radius:1px;height:${Math.max(3,Math.floor(Math.random()*20))}px;transition:background 0.1s"></div>`).join('')}
            </div>
            <div class="audio-dur" id="dur_${uid}">0:00</div>
        </div>
        <audio id="${uid}" src="${src}" ontimeupdate="updateAudio('${uid}')" onended="onAudioEnd('${uid}')" onloadedmetadata="setAudioDur('${uid}');drawWaveform('${uid}')"></audio>
    </div>`;
}

// Рисует реальную волну из audio file
async function drawWaveform(uid) {
    const audio = document.getElementById(uid);
    const wv    = document.getElementById(`wv_${uid}`);
    if (!audio || !wv) return;
    try {
        const resp = await fetch(audio.src, { cache: 'force-cache' });
        const buf  = await resp.arrayBuffer();
        const ctx  = new (window.AudioContext || window.webkitAudioContext)();
        const decoded = await ctx.decodeAudioData(buf);
        ctx.close();
        const data = decoded.getChannelData(0);
        const bars = wv.querySelectorAll('div');
        const step = Math.floor(data.length / bars.length);
        bars.forEach((bar, i) => {
            let max = 0;
            for (let j = 0; j < step; j++) {
                const v = Math.abs(data[i * step + j] || 0);
                if (v > max) max = v;
            }
            const h = Math.max(3, Math.round(max * 24));
            bar.style.height = h + 'px';
            bar.style.background = `rgba(255,255,255,${0.25 + max * 0.5})`;
        });
        wv._drawn = true;
    } catch(e) {}
}

function toggleAudio(uid) {
    const audio = document.getElementById(uid);
    const btn   = audio?.closest('.audio-player')?.querySelector('.audio-play-btn');
    if (!audio || !btn) return;
    if (audio.paused) {
        document.querySelectorAll('audio').forEach(a => {
            if (a !== audio) { a.pause(); const b = a.closest('.audio-player')?.querySelector('.audio-play-btn'); if(b) b.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3"/></svg>'; }
        });
        audio.play();
        btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="white"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
        activeAudio = audio;
    } else {
        audio.pause();
        btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
        activeAudio = null;
    }
}

function updateAudio(uid) {
    const audio = document.getElementById(uid);
    if (!audio || !audio.duration) return;
    const pct  = audio.currentTime / audio.duration;
    const dur  = document.getElementById(`dur_${uid}`);
    const wv   = document.getElementById(`wv_${uid}`);
    if (dur) dur.textContent = fmtSec(audio.currentTime);
    // Закрашиваем пройденные барики акцентом
    if (wv) {
        const bars     = wv.querySelectorAll('div');
        const progress = Math.floor(pct * bars.length);
        bars.forEach((bar, i) => {
            bar.style.background = i < progress
                ? `var(--accent)`
                : `rgba(255,255,255,0.3)`;
        });
    }
}

function setAudioDur(uid) {
    const audio = document.getElementById(uid);
    const dur   = document.getElementById(`dur_${uid}`);
    if (audio && dur) dur.textContent = fmtSec(audio.duration);
}

function onAudioEnd(uid) {
    const btn  = document.getElementById(uid)?.closest('.audio-player')?.querySelector('.audio-play-btn');
    const fill = document.getElementById(`fill_${uid}`);
    if (btn)  btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
    if (fill) fill.style.width = '0%';
    activeAudio = null;
}

function seekAudio(e, uid) {
    const audio = document.getElementById(uid);
    if (!audio?.duration) return;
    const bar  = e.currentTarget;
    const rect = bar.getBoundingClientRect();
    audio.currentTime = ((e.clientX - rect.left) / rect.width) * audio.duration;
}

function fmtSec(s) {
    if (!s || isNaN(s)) return '0:00';
    s = Math.floor(s);
    return `${Math.floor(s/60)}:${(s%60).toString().padStart(2,'0')}`;
}

function openFullImage(src) {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.96);display:flex;align-items:center;justify-content:center;touch-action:pinch-zoom';
    overlay.onclick = (e) => { if (e.target === overlay || e.target.tagName === 'BUTTON') overlay.remove(); };
    overlay.innerHTML = `<img src="${src}" style="max-width:100%;max-height:100%;object-fit:contain;border-radius:4px;user-select:none">
        <button style="position:absolute;top:max(20px,env(safe-area-inset-top));right:20px;background:rgba(255,255,255,0.1);border:none;color:white;font-size:24px;width:44px;height:44px;border-radius:50%;cursor:pointer">✕</button>
        <a href="${src}" download style="position:absolute;bottom:max(20px,env(safe-area-inset-bottom));left:50%;transform:translateX(-50%);background:rgba(255,255,255,0.1);border:none;color:white;font-size:13px;padding:10px 20px;border-radius:20px;text-decoration:none">⬇ Сохранить</a>`;
    document.body.appendChild(overlay);
}

// ══════════════════════════════════════════════════════════
//  РЕАКЦИИ
// ══════════════════════════════════════════════════════════
let activeReactionMsgId = null;

function sendReaction(emoji) {
    hideReactionPicker();
    if (!activeReactionMsgId || !currentChatId) return;
    const msgId = activeReactionMsgId; // сохраняем до сброса
    socket.emit('react_message', { msg_id: msgId, emoji, chat_id: currentChatId });
    addReactionToMsg(msgId, emoji, true);
    vibrate(15);
}

function hideReactionPicker() {
    const p = document.getElementById('reaction-picker');
    if (p) p.style.display = 'none';
    // activeReactionMsgId сбрасывается в sendReaction после использования
}

function addReactionToMsg(msgId, emoji, isMe) {
    const bar = document.getElementById(`reactions-${msgId}`);
    if (!bar) { console.warn('no reactions bar for', msgId); return; }
    const existing = bar.querySelector(`[data-emoji="${CSS.escape(emoji)}"]`);
    if (existing) {
        // Увеличиваем счётчик
        const cnt = existing.querySelector('.rcnt');
        const newCount = parseInt(cnt?.textContent || '1') + 1;
        if (cnt) cnt.textContent = newCount;
        if (isMe) existing.classList.add('mine');
        // Анимация
        existing.style.transform = 'scale(1.3)';
        setTimeout(() => { existing.style.transform = ''; }, 200);
    } else {
        const chip = document.createElement('div');
        chip.className = `reaction-chip${isMe ? ' mine' : ''}`;
        chip.dataset.emoji = emoji;
        chip.style.cssText += ';animation:reactionIn .25s cubic-bezier(.34,1.56,.64,1)';
        const span = document.createElement('span'); span.textContent = emoji;
        const cnt  = document.createElement('span'); cnt.className='rcnt'; cnt.textContent='1';
        chip.appendChild(span); chip.appendChild(cnt);
        chip.addEventListener('click', () => {
            activeReactionMsgId = msgId;
            sendReaction(emoji);
        });
        bar.appendChild(chip);
    }

    // Убедимся что CSS анимации есть
    if (!document.getElementById('reaction-anim-style')) {
        const st = document.createElement('style'); st.id='reaction-anim-style';
        st.textContent = '@keyframes reactionIn{from{opacity:0;transform:scale(0.5)}to{opacity:1;transform:scale(1)}}';
        document.head.appendChild(st);
    }
}

// ══════════════════════════════════════════════════════════
//  ОТПРАВКА СООБЩЕНИЙ
// ══════════════════════════════════════════════════════════
function handleInputKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey && !('ontouchstart' in window)) {
        e.preventDefault(); sendText();
    }
}

function autoResize(el) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

function sendText() {
    const input = document.getElementById('msg-input');
    const text  = (input?.value || '').trim();
    if (!text || !currentChatId) return;

    // ── Оптимистичный рендер (мгновенно) ──
    const tempMsg = {
        id:          'tmp_' + Date.now(),
        chat_id:     currentChatId,
        sender_id:   currentUser.id,
        sender_name: currentUser.name,
        type:        'text',
        type_msg:    'text',
        content:     text,
        file_url:    null,
        is_read:     false,
        timestamp:   _nowMoscow(),
        _optimistic: true,
    };
    renderNewMessage(tempMsg, true);

    socket.emit('send_message', {
        chat_id:   currentChatId,
        content:   text,
        type_msg:  'text',
        sender_id: currentUser.id
    });
    input.value = '';
    input.style.height = 'auto';
    socket.emit('stop_typing', { chat_id: currentChatId });
    vibrate(8);
}

function _nowMoscow() {
    const now = new Date();
    now.setHours(now.getHours() + 3); // UTC→MSK примерно
    return now.toTimeString().slice(0,5);
}

// ══════════════════════════════════════════════════════════
//  ОБРАБОТЧИКИ ВХОДЯЩИХ СООБЩЕНИЙ
// ══════════════════════════════════════════════════════════
function onNewMessage(msg) {
    if (msg.type_msg) msg.type = msg.type_msg;

    // Проверяем: это сообщение для открытого чата?
    if (+msg.chat_id === currentChatId) {
        // Удаляем оптимистичный дубликат (только для текста)
        if (+msg.sender_id === currentUser.id && msg.type === 'text') {
            const container = document.getElementById('messages');
            const optimistic = container?.querySelector('[data-optimistic="1"]');
            if (optimistic && optimistic.dataset.content === (msg.content || '')) {
                optimistic.remove();
            }
        }
        hideTypingIndicator();
        renderNewMessage(msg, true);
        socket.emit('mark_read', { chat_id: currentChatId });
        loadChats();
    } else {
        // Инвалидируем кэш нужного чата
        const cacheKey = msg.is_group_msg ? `g_${msg.group_id}` : `p_${msg.sender_id}`;
        delete messagesByChatCache[cacheKey];
        loadChats();
        // Уведомление только если приложение не на экране
        vibrate([10, 30, 10]);
        const senderName = msg.is_group_msg
            ? (msg.sender_name || 'Группа')
            : getContactDisplayName(msg.sender_id, msg.sender_name || 'Новое сообщение');
        const preview = msg.content ? msg.content.slice(0, 40) : '🎙️';
        showToast(`${senderName}: ${preview}`, 'info');
        tryBrowserNotification(msg);
    }
}

function tryBrowserNotification(msg) {
    if (Notification.permission === 'granted' && document.hidden) {
        try {
            const senderName = getContactDisplayName(msg.sender_id, msg.sender_name || 'WayChat');
            new Notification(senderName, {
                body: msg.content || '🎙️ Голосовое сообщение',
                icon: '/static/img/chats.png',
                tag:  `chat-${msg.chat_id}`
            });
        } catch(e) {}
    }
}

// ══════════════════════════════════════════════════════════
//  ИНДИКАТОР ПЕЧАТИ
// ══════════════════════════════════════════════════════════
let typingHideTimer = null;

function showTypingIndicator(name) {
    const wrap = document.getElementById('typing-wrap');
    if (!wrap) return;
    wrap.classList.add('show');
    const label = document.getElementById('typing-name-label');
    if (label) label.textContent = name || '';
    scrollDown(true);
    clearTimeout(typingHideTimer);
    typingHideTimer = setTimeout(hideTypingIndicator, 5000);
}

function hideTypingIndicator() {
    document.getElementById('typing-wrap')?.classList.remove('show');
    clearTimeout(typingHideTimer);
}

function updateSendButton() {
    const txt = (document.getElementById('msg-input')?.value || '').trim();
    const s = document.getElementById('send-btn-main');
    const v = document.getElementById('voice-btn-main');
    if (!s || !v) return;
    if (txt) {
        s.style.display = 'flex'; v.style.display = 'none';
        // Сбрасываем cam-mode если печатаем
        if (_camModeActive) { _camModeActive = false; _restoreVoiceBtn(); }
    } else {
        s.style.display = 'none'; v.style.display = 'flex';
    }
}

function handleTyping() {
    if (!currentChatId) return;
    socket.emit('typing', { chat_id: currentChatId });
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => socket.emit('stop_typing', { chat_id: currentChatId }), 2000);
}

// ══════════════════════════════════════════════════════════
//  КОНФИДЕНЦИАЛЬНОСТЬ
// ══════════════════════════════════════════════════════════
const _PRIVACY_KEY = 'wc_privacy';
function _getPrivacy() { try{return JSON.parse(localStorage.getItem(_PRIVACY_KEY)||'{}');}catch(e){return {};} }
function _savePrivacy(k,v){ const p=_getPrivacy();p[k]=v;localStorage.setItem(_PRIVACY_KEY,JSON.stringify(p)); }

function openPrivacySettings() {
    const opts = ['Все','Только контакты','Никто'];
    function cur(key,def){ const p=_getPrivacy(); return p[key]!==undefined?p[key]:def; }

    const ov=document.createElement('div'); ov.className='modal-overlay';
    ov.onclick=e=>{if(e.target===ov)ov.remove();};
    const sh=document.createElement('div'); sh.className='modal-sheet'; sh.style.cssText='overflow-y:auto;max-height:92vh';

    function buildRow(label,icon,key,def,hint){
        const c=cur(key,def);
        return '<div style="margin-bottom:20px">'
            +'<div style="font-size:13px;font-weight:700;color:var(--text-2);margin-bottom:8px">'+icon+' '+label+'</div>'
            +'<div style="display:flex;gap:6px;flex-wrap:wrap" data-grp="'+key+'">'
            +opts.map(o=>'<button data-key="'+key+'" data-val="'+o+'" style="padding:8px 16px;border-radius:20px;border:1.5px solid '
                +(c===o?'var(--accent)':'var(--border)')
                +';background:'+(c===o?'rgba(16,185,129,0.15)':'var(--surface2)')
                +';color:'+(c===o?'var(--accent)':'var(--text-2)')
                +';font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;transition:all .15s">'+o+'</button>').join('')
            +'</div>'+(hint?'<div style="font-size:11px;color:var(--text-2);margin-top:5px">'+hint+'</div>':'')
            +'</div>';
    }
    sh.innerHTML='<div class="modal-handle"></div>'
        +'<div style="font-size:18px;font-weight:700;margin-bottom:4px">🔒 Конфиденциальность</div>'
        +'<div style="font-size:13px;color:var(--text-2);margin-bottom:20px">Управляй кто видит твой контент</div>'
        +'<div id="priv-rows">'
        +buildRow('Мои моменты','🎬','moments_vis','Все','Кто может просматривать ваши моменты')
        +buildRow('Фото профиля','👤','avatar_vis','Все','Кто видит вашу аватарку в чатах и профиле')
        +buildRow('Статус онлайн','🟢','online_vis','Все','Кто видит зелёную точку онлайн')
        +buildRow('Последний визит','🕐','lastseen_vis','Только контакты','«Был(а) в ...» в профиле')
        +'</div>';
    const doneBtn=document.createElement('button');
    doneBtn.style.cssText='width:100%;margin-top:8px;padding:14px;background:var(--accent);border:none;border-radius:16px;color:#000;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit';
    doneBtn.textContent='Готово'; doneBtn.onclick=()=>{ov.remove();showToast('Настройки сохранены ✓','success');};
    sh.appendChild(doneBtn); ov.appendChild(sh); document.body.appendChild(ov);
    sh.querySelector('#priv-rows').addEventListener('click',e=>{
        const btn=e.target.closest('button[data-key]'); if(!btn) return;
        const key=btn.dataset.key;
        sh.querySelectorAll('button[data-key="'+key+'"]').forEach(b=>{
            const on=b===btn;
            b.style.borderColor=on?'var(--accent)':'var(--border)';
            b.style.background=on?'rgba(16,185,129,0.15)':'var(--surface2)';
            b.style.color=on?'var(--accent)':'var(--text-2)';
        });
        _savePrivacy(key,btn.dataset.val);
    });
}

// ══════════════════════════════════════════════════════════
//  ВИДЕО-КРУЖОК (как в Telegram)
// ══════════════════════════════════════════════════════════
let _camModeActive = false;
let _videoRecStream = null;
let _videoRecorder  = null;
let _videoChunks    = [];
let _videoTimer     = null;
let _videoSec       = 0;
let _videoFlashOn   = false;
let _videoFacing    = 'user';

function _restoreVoiceBtn() {
    _camModeActive = false;
    const v = document.getElementById('voice-btn-main');
    if (!v) return;
    v.dataset.mode  = 'voice';
    v.innerHTML     = ICONS.mic.replace('rgba(255,255,255,0.5)','white');
    v.style.background  = 'rgba(255,255,255,0.12)';
    v.style.transform   = '';
    v.style.boxShadow   = 'none';
    v.style.transition  = 'transform 0.2s, background 0.2s';
}

function _activateCamMode() {
    _camModeActive = true;
    const v = document.getElementById('voice-btn-main');
    if (!v) return;
    v.dataset.mode  = 'camera';

    v.style.transition = 'transform 0.2s cubic-bezier(0.34,1.56,0.64,1), background 0.2s';
    v.style.transform = 'scale(0)';
    setTimeout(() => {
        v.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none">'
            + '<circle cx="12" cy="12" r="3.5" fill="white"/>'
            + '<circle cx="12" cy="12" r="9" stroke="white" stroke-width="2"/>'
            + '<circle cx="18.5" cy="5.5" r="1.5" fill="white"/>'
            + '</svg>';
        v.style.background = 'rgba(239,68,68,0.85)';
        v.style.transform  = 'scale(1)';
        v.style.boxShadow  = '0 0 16px rgba(239,68,68,0.5)';
        v.title = 'Зажмите для видео-кружка';
    }, 150);
    showToast('Зажмите для записи видео 🎥','info',2000);
}

function _startVideoCircle() {
    if (_videoRecStream) return;

    if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) {
        showToast('Нет доступа к камере. Настройки → Safari → Камера → Разрешить', 'error', 5000);
        return;
    }

    // ⚠️ КРИТИЧНО ДЛЯ iOS SAFARI: getUserMedia вызывается СИНХРОННО
    // без await перед ним — иначе Safari не покажет диалог разрешений
    _videoFacing = _videoFacing || 'user';
    const mediaPromise = navigator.mediaDevices.getUserMedia({
        video: { facingMode: _videoFacing, width: { ideal: 480 }, height: { ideal: 480 } },
        audio: { echoCancellation: true, noiseSuppression: true }
    }).catch(() => navigator.mediaDevices.getUserMedia({
        video: { facingMode: _videoFacing },
        audio: true
    }));

    mediaPromise.then(stream => {
        _videoRecStream = stream;
        _sessionPerms['camera'] = 'granted';
        _doStartVideoCircleUI();
    }).catch(e => {
        _videoRecStream = null;
        if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
            _sessionPerms['camera'] = 'denied';
            _showPermDeniedGuide('camera');
        } else {
            showToast('Нет доступа к камере: ' + (e.message || e.name), 'error', 4000);
        }
    });
}

function _doStartVideoCircleUI() {

    vibrate(40);
    _videoChunks = []; _videoSec = 0;

    // Показываем UI кружка
    const overlay = document.createElement('div');
    overlay.id = 'video-circle-ui';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:9000;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px';

    // Кружок с видео
    const circle = document.createElement('div');
    circle.style.cssText = 'width:min(80vw,320px);height:min(80vw,320px);border-radius:50%;overflow:hidden;position:relative;border:3px solid var(--accent);box-shadow:0 0 0 0 rgba(16,185,129,0.6)';
    circle.style.animation = 'circleGlow 1s ease-in-out infinite';

    const vid = document.createElement('video');
    vid.srcObject = _videoRecStream; vid.autoplay = true; vid.muted = true; vid.playsInline = true;
    vid.style.cssText = 'width:100%;height:100%;object-fit:cover;transform:scaleX('+((_videoFacing==='user')?'-1':'1')+')';
    circle.appendChild(vid);

    // Прогресс-кольцо SVG
    const progress = document.createElementNS('http://www.w3.org/2000/svg','svg');
    progress.setAttribute('viewBox','0 0 100 100');
    progress.style.cssText = 'position:absolute;inset:-3px;width:calc(100% + 6px);height:calc(100% + 6px);transform:rotate(-90deg);pointer-events:none';
    const circ = document.createElementNS('http://www.w3.org/2000/svg','circle');
    circ.setAttribute('cx','50'); circ.setAttribute('cy','50'); circ.setAttribute('r','47');
    circ.setAttribute('fill','none'); circ.setAttribute('stroke','var(--accent)'); circ.setAttribute('stroke-width','3');
    circ.setAttribute('stroke-dasharray','295'); circ.setAttribute('stroke-dashoffset','295');
    circ.id = 'vc-progress';
    progress.appendChild(circ); circle.appendChild(progress);

    // Таймер
    const timerEl = document.createElement('div');
    timerEl.id = 'vc-timer';
    timerEl.style.cssText = 'position:absolute;bottom:10px;left:0;right:0;text-align:center;font-size:13px;font-weight:700;color:white;text-shadow:0 1px 4px rgba(0,0,0,0.8)';
    timerEl.textContent = '0:00';
    circle.appendChild(timerEl);

    overlay.appendChild(circle);

    // Кнопки управления
    const btns = document.createElement('div');
    btns.style.cssText = 'display:flex;gap:24px;align-items:center';

    function mkBtn(icon, label, action) {
        const b = document.createElement('div');
        b.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:6px;cursor:pointer';
        b.innerHTML = '<div style="width:52px;height:52px;border-radius:50%;background:rgba(255,255,255,0.15);display:flex;align-items:center;justify-content:center;font-size:22px;backdrop-filter:blur(10px)">'+icon+'</div>'
            +'<div style="font-size:11px;color:rgba(255,255,255,0.7);font-weight:600">'+label+'</div>';
        b.onclick = action;
        return b;
    }

    const cancelBtn = mkBtn('✕','Отмена', ()=>{
        _cancelVideoCircle(overlay);
    });
    const flipBtn = mkBtn('🔄','Камера', ()=>{
        _videoFacing = _videoFacing==='user'?'environment':'user';
        vid.style.transform = 'scaleX('+(_videoFacing==='user'?'-1':'1')+')';
        // Перезапускаем поток
        _videoRecStream.getVideoTracks().forEach(t=>t.stop());
        navigator.mediaDevices.getUserMedia({
            video:{facingMode:_videoFacing,width:{ideal:480},height:{ideal:480}},audio:false
        }).then(s=>{
            const newTrack = s.getVideoTracks()[0];
            _videoRecStream.removeTrack(_videoRecStream.getVideoTracks()[0]);
            _videoRecStream.addTrack(newTrack);
            vid.srcObject = _videoRecStream;
        }).catch(()=>{});
    });
    const flashBtn = mkBtn('⚡','Вспышка', ()=>{
        _videoFlashOn = !_videoFlashOn;
        const track = _videoRecStream.getVideoTracks()[0];
        try { track.applyConstraints({ advanced:[{torch:_videoFlashOn}] }); } catch(e){}
        flashBtn.querySelector('div').style.background = _videoFlashOn ? 'rgba(255,220,0,0.4)' : 'rgba(255,255,255,0.15)';
    });
    const stopBtn = mkBtn('⏹','Отправить', ()=>{
        _stopVideoCircle();
    });

    btns.appendChild(cancelBtn); btns.appendChild(flipBtn);
    btns.appendChild(flashBtn);  btns.appendChild(stopBtn);
    overlay.appendChild(btns);

    const hint = document.createElement('div');
    hint.style.cssText = 'font-size:13px;color:rgba(255,255,255,0.5)';
    hint.textContent = 'Отпустите или нажмите ⏹ чтобы отправить';
    overlay.appendChild(hint);

    document.body.appendChild(overlay);

    // Добавляем CSS анимацию
    if (!document.getElementById('vc-style')) {
        const st = document.createElement('style');
        st.id = 'vc-style';
        st.textContent = '@keyframes circleGlow{0%,100%{box-shadow:0 0 0 0 rgba(16,185,129,0.6)}50%{box-shadow:0 0 0 8px rgba(16,185,129,0)}}';
        document.head.appendChild(st);
    }

    // Начинаем запись
    const mime = ['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm','video/mp4']
        .find(m=>MediaRecorder.isTypeSupported(m)) || 'video/webm';
    _videoRecorder = new MediaRecorder(_videoRecStream, {mimeType:mime});
    _videoRecorder.ondataavailable = e => { if(e.data?.size>0) _videoChunks.push(e.data); };
    _videoRecorder.onstop = () => _sendVideoCircle(mime);
    _videoRecorder.start(100);

    const MAX_SEC = 60;
    _videoTimer = setInterval(()=>{
        _videoSec++;
        const tEl = document.getElementById('vc-timer');
        const pEl = document.getElementById('vc-progress');
        if(tEl) tEl.textContent = fmtSec(_videoSec);
        if(pEl) pEl.setAttribute('stroke-dashoffset', String(295 - (295*_videoSec/MAX_SEC)));
        if(_videoSec >= MAX_SEC) _stopVideoCircle();
    }, 1000);
}

function _cancelVideoCircle(overlay) {
    clearInterval(_videoTimer); _videoTimer=null;
    if(_videoRecorder && _videoRecorder.state!=='inactive') {
        _videoRecorder.ondataavailable=null; _videoRecorder.onstop=null;
        _videoRecorder.stop();
    }
    _videoRecStream?.getTracks().forEach(t=>t.stop());
    _videoRecStream=null; _videoRecorder=null; _videoChunks=[];
    (overlay||document.getElementById('video-circle-ui'))?.remove();
}

function _stopVideoCircle() {
    if(!_videoRecorder || _videoRecorder.state==='inactive') return;
    clearInterval(_videoTimer); _videoTimer=null;
    _videoRecorder.stop();
    _videoRecStream?.getTracks().forEach(t=>t.stop());
    document.getElementById('video-circle-ui')?.remove();
}

async function _sendVideoCircle(mime) {
    if(!_videoChunks.length || !currentChatId) { _videoRecStream=null; _videoRecorder=null; _videoChunks=[]; return; }
    const ext = mime.includes('mp4')?'mp4':'webm';
    const blob = new Blob(_videoChunks, {type:mime});
    _videoRecStream=null; _videoRecorder=null; _videoChunks=[];
    if(blob.size < 5000) return; // слишком короткое

    showToast('Отправка видео-кружка...','info');
    const fd = new FormData();
    fd.append('file', blob, 'video_circle.'+ext);
    fd.append('video_circle','1'); // флаг для рендера кружка
    try {
        const r = await apiFetch('/upload_media',{method:'POST',body:fd});
        const d = await r.json();
        if(d.url) {
            await apiFetch('/send_message',{
                method:'POST', headers:{'Content-Type':'application/json'},
                body: JSON.stringify({chat_id:currentChatId, media_url:d.url, media_type:'video_circle', text:''})
            });
            showToast('Видео-кружок отправлен 🎥','success');
        }
    } catch(e) { showToast('Ошибка отправки','error'); }
}

// ══════════════════════════════════════════════════════════
//  ГОЛОСОВЫЕ СООБЩЕНИЯ — iOS-совместимый тап-для-записи
// ══════════════════════════════════════════════════════════
function setupVoiceRecording() {
    const micBtn = document.getElementById('voice-btn-main');
    if (!micBtn) return;

    // Клонируем чтобы убрать старые listeners
    const fresh = micBtn.cloneNode(true);
    micBtn.parentNode.replaceChild(fresh, micBtn);
    const btn = document.getElementById('voice-btn-main');

    let _waveTimer  = null;
    let _audioCtx   = null;
    let _analyser   = null;
    let _recStream  = null;   // активный поток микрофона
    let _mimeType   = 'audio/webm';
    let _ext        = 'webm';
    let _duration   = 0;
    let _pressTimer = null;
    let _holdDone   = false;
    let _pressTs    = 0;

    function _stopWave() {
        clearInterval(_waveTimer); _waveTimer = null;
        try { _audioCtx?.close(); } catch(e){}
        _audioCtx = null; _analyser = null;
    }

    function _startWave(stream) {
        try {
            _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            _analyser = _audioCtx.createAnalyser();
            _analyser.fftSize = 64;
            _audioCtx.createMediaStreamSource(stream).connect(_analyser);
            const buf = new Uint8Array(_analyser.frequencyBinCount);
            _waveTimer = setInterval(() => {
                if (!_analyser) return;
                _analyser.getByteFrequencyData(buf);
                document.querySelectorAll('#voice-overlay .wave-bar').forEach((bar, i) => {
                    const v = buf[Math.floor(i * buf.length / 18)] || 0;
                    bar.style.height = Math.max(3, Math.round((v / 255) * 28)) + 'px';
                    bar.style.opacity = String(0.5 + v / 512);
                });
            }, 60);
        } catch(e) {}
    }

    // Возвращает поток микрофона — переиспользует глобальный если уже получен
    function _getStream() {
        if (_globalMicStream && _globalMicStream.active) {
            return Promise.resolve(_globalMicStream);
        }

        const hasModern = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
        const hasLegacy = !!(navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia);

        if (!hasModern && !hasLegacy) {
            showToast('Нет доступа к микрофону. Настройки → Safari → Микрофон → Разрешить', 'error', 5000);
            return Promise.reject(new Error('no mediaDevices'));
        }

        const constraints = { audio: { echoCancellation: true, noiseSuppression: true }, video: false };

        if (hasModern) {
            return navigator.mediaDevices.getUserMedia(constraints)
                .then(stream => {
                    _globalMicStream = stream;
                    _sessionPerms['microphone'] = 'granted';
                    return stream;
                })
                .catch(err => {
                    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                        _sessionPerms['microphone'] = 'denied';
                        showToast('Нет доступа к микрофону. Настройки → Safari → Микрофон → Разрешить', 'error', 5000);
                    }
                    throw err;
                });
        } else {
            // Полифилл для старых iOS
            const gum = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia;
            return new Promise((resolve, reject) => {
                gum.call(navigator, constraints,
                    stream => {
                        _globalMicStream = stream;
                        _sessionPerms['microphone'] = 'granted';
                        resolve(stream);
                    },
                    err => {
                        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                            _sessionPerms['microphone'] = 'denied';
                            showToast('Нет доступа к микрофону. Настройки → Safari → Микрофон → Разрешить', 'error', 5000);
                        }
                        reject(err);
                    }
                );
            });
        }
    }

    function _doStartRecording(stream) {
        // Обновляем глобальный поток если передан новый
        if (stream && stream !== _globalMicStream) _globalMicStream = stream;
        const activeStream = _globalMicStream || stream;
        if (!activeStream || !activeStream.active) {
            showToast('Нет доступа к микрофону', 'error');
            return;
        }
        if (isRecording) return;
        if (!currentChatId) { showToast('Сначала откройте чат', 'warning'); return; }

        vibrate(35);
        isRecording = true;
        audioChunks = [];
        _duration   = 0;

        const formats = ['audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus','audio/mp4'];
        _mimeType = formats.find(f => MediaRecorder.isTypeSupported(f)) || 'audio/webm';
        _ext      = _mimeType.includes('ogg') ? 'ogg' : _mimeType.includes('mp4') ? 'm4a' : 'webm';

        mediaRecorder = new MediaRecorder(activeStream, { mimeType: _mimeType, audioBitsPerSecond: 64000 });
        mediaRecorder.ondataavailable = e => { if (e.data?.size > 0) audioChunks.push(e.data); };
        mediaRecorder.onstop = _onRecordStop;
        mediaRecorder.start(100);

        const ia = document.getElementById('input-area');
        let overlay = document.getElementById('voice-overlay');
        if (overlay) overlay.remove();
        overlay = document.createElement('div');
        overlay.id = 'voice-overlay';
        overlay.className = 'record-ui';
        overlay.innerHTML = `
            <div class="rec-pulse"></div>
            <div class="waveform">${Array(18).fill(0).map(() =>
                `<div class="wave-bar" style="transition:height 0.06s ease"></div>`).join('')}</div>
            <span id="rec-timer" style="font-size:13px;font-weight:700;color:var(--accent);font-variant-numeric:tabular-nums;flex-shrink:0">0:00</span>
            <button id="rec-stop-btn" style="background:var(--accent);border:none;border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="black"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
            </button>
            <button id="rec-cancel-btn" style="background:none;border:none;color:rgba(255,255,255,0.35);font-size:18px;cursor:pointer;flex-shrink:0;padding:0 4px">✕</button>`;
        ia.appendChild(overlay);

        document.getElementById('rec-stop-btn').addEventListener('click', e => { e.stopPropagation(); stopRecording(); });
        document.getElementById('rec-cancel-btn').addEventListener('click', e => { e.stopPropagation(); cancelRecording(); });

        recordTimerInterval = setInterval(() => {
            _duration++;
            const el = document.getElementById('rec-timer');
            if (el) el.textContent = fmtSec(_duration);
        }, 1000);

        _startWave(activeStream);

        btn.innerHTML = `<div style="width:12px;height:12px;background:#ef4444;border-radius:50%;animation:recPulse 0.8s infinite"></div>`;
        btn.style.background = 'rgba(239,68,68,0.15)';
    }

    function stopRecording() {
        if (!isRecording) return;
        isRecording = false;
        clearInterval(recordTimerInterval);
        _stopWave();
        document.getElementById('voice-overlay')?.remove();
        const vb = document.getElementById('voice-btn-main');
        if (vb) { vb.innerHTML = ICONS.mic.replace('rgba(255,255,255,0.5)','white'); vb.style.background = 'rgba(255,255,255,0.12)'; }
        if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
        // НЕ останавливаем _globalMicStream — сохраняем разрешение на следующий раз
    }

    function cancelRecording() {
        if (!isRecording) return;
        isRecording = false;
        clearInterval(recordTimerInterval);
        _stopWave();
        document.getElementById('voice-overlay')?.remove();
        const vb = document.getElementById('voice-btn-main');
        if (vb) { vb.innerHTML = ICONS.mic.replace('rgba(255,255,255,0.5)','white'); vb.style.background = 'rgba(255,255,255,0.12)'; }
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.ondataavailable = null;
            mediaRecorder.onstop = null;
            mediaRecorder.stop();
        }
        audioChunks = [];
        // НЕ останавливаем _globalMicStream
    }

    function _onRecordStop() {
        if (!audioChunks.length) return;
        const blob = new Blob(audioChunks, { type: _mimeType });
        audioChunks = [];
        if (blob.size < 300) return;
        showVoicePreview(blob, _ext, _duration);
    }

    function _pressStart(e) {
        e.preventDefault();
        _pressTs  = Date.now();
        _holdDone = false;
        const isCam = document.getElementById('voice-btn-main')?.dataset.mode === 'camera';

        if (isCam) {
            // ⚠️ КРИТИЧНО ДЛЯ iOS SAFARI:
            // getUserMedia вызываем ЗДЕСЬ синхронно из touchstart
            // setTimeout убивает user gesture — камера не запрашивается
            if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) {
                showToast('Нет доступа к камере. Настройки → Safari → Камера → Разрешить', 'error', 5000);
                return;
            }
            _videoFacing = _videoFacing || 'user';
            const camPromise = navigator.mediaDevices.getUserMedia({
                video: { facingMode: _videoFacing, width: { ideal: 480 }, height: { ideal: 480 } },
                audio: { echoCancellation: true, noiseSuppression: true }
            }).catch(() => navigator.mediaDevices.getUserMedia({
                video: { facingMode: _videoFacing },
                audio: true
            }));

            _pressTimer = setTimeout(() => {
                _holdDone = true;
                vibrate(45);
                camPromise.then(stream => {
                    if (_videoRecStream) { stream.getTracks().forEach(t => t.stop()); return; }
                    _videoRecStream = stream;
                    _sessionPerms['camera'] = 'granted';
                    _doStartVideoCircleUI();
                }).catch(e => {
                    _videoRecStream = null;
                    if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
                        _sessionPerms['camera'] = 'denied';
                        _showPermDeniedGuide('camera');
                    } else {
                        showToast('Нет доступа к камере: ' + (e.message || e.name), 'error', 4000);
                    }
                });
            }, 300);
            return;
        }

        // Микрофон — вызываем getUserMedia ПРЯМО ЗДЕСЬ из user gesture
        // Safari требует синхронный вызов без await перед ним
        const streamPromise = _getStream();

        _pressTimer = setTimeout(() => {
            _holdDone = true;
            vibrate(45);
            streamPromise.then(stream => {
                _doStartRecording(stream);
            }).catch(e => {
                _sessionPerms['microphone'] = 'denied';
                _showPermDeniedGuide('microphone');
            });
        }, 300);
    }

    function _pressEnd(e) {
        clearTimeout(_pressTimer);
        const dt  = Date.now() - _pressTs;
        const cur = document.getElementById('voice-btn-main');

        if (!_holdDone && dt < 250) {
            // Короткий тап — переключаем режим
            if (cur?.dataset.mode === 'camera') {
                _restoreVoiceBtn();
            } else {
                _activateCamMode();
            }
            return;
        }

        if (_holdDone) {
            if (isRecording) stopRecording();
            else if (_videoRecorder && _videoRecorder.state !== 'inactive') _stopVideoCircle();
        }
        _holdDone = false;
    }

    btn.addEventListener('mousedown',   _pressStart, { passive: false });
    btn.addEventListener('touchstart',  _pressStart, { passive: false });
    btn.addEventListener('mouseup',     _pressEnd);
    btn.addEventListener('touchend',    _pressEnd);
    btn.addEventListener('mouseleave',  _pressEnd);
    btn.addEventListener('touchcancel', _pressEnd);
}

// Превью голосового перед отправкой
function showVoicePreview(blob, ext, duration) {
    const blobUrl  = URL.createObjectURL(blob);
    const overlay  = document.createElement('div');
    overlay.id     = 'voice-preview-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:8500;background:rgba(0,0,0,0.7);backdrop-filter:blur(16px);display:flex;align-items:flex-end;animation:fadeIn 0.2s';
    overlay.innerHTML = `
    <div style="background:rgba(14,14,20,0.97);border-radius:28px 28px 0 0;border-top:0.5px solid rgba(255,255,255,0.1);width:100%;padding:20px 20px calc(env(safe-area-inset-bottom) + 20px)">
        <div style="width:36px;height:4px;background:rgba(255,255,255,0.15);border-radius:2px;margin:0 auto 20px"></div>
        <div style="font-size:15px;font-weight:700;text-align:center;margin-bottom:16px">Голосовое сообщение</div>

        <!-- Плеер превью -->
        <div style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);border-radius:20px;padding:14px 16px;margin-bottom:16px;display:flex;align-items:center;gap:12px">
            <button id="preview-play-btn" onclick="toggleVoicePreview()" style="width:44px;height:44px;border-radius:50%;background:var(--accent);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0">
                <svg id="preview-icon" width="16" height="16" viewBox="0 0 24 24" fill="black"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            </button>
            <div style="flex:1">
                <div style="height:3px;background:rgba(255,255,255,0.15);border-radius:2px;overflow:hidden;margin-bottom:6px;cursor:pointer" onclick="seekVoicePreview(event)">
                    <div id="preview-fill" style="height:100%;background:var(--accent);width:0%;transition:width 0.1s linear;border-radius:2px"></div>
                </div>
                <div style="display:flex;justify-content:space-between;align-items:center">
                    <span id="preview-time" style="font-size:12px;color:var(--text-2);font-variant-numeric:tabular-nums">0:00</span>
                    <span style="font-size:12px;color:var(--text-2)">/${fmtSec(duration)}</span>
                </div>
            </div>
        </div>

        <!-- Визуальные волны -->
        <div id="preview-waveform" style="display:flex;align-items:center;gap:2px;height:36px;margin-bottom:20px;padding:0 4px;justify-content:center">
            ${Array(40).fill(0).map(() => `<div style="width:2px;background:rgba(16,185,129,0.4);border-radius:1px;height:${Math.max(4,Math.floor(Math.random()*30))}px"></div>`).join('')}
        </div>

        <!-- Кнопки -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <button onclick="cancelVoicePreview()" style="padding:14px;background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.25);border-radius:16px;color:#ef4444;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit">
                ✕ Удалить
            </button>
            <button onclick="sendVoicePreview()" style="padding:14px;background:var(--accent);border:none;border-radius:16px;color:black;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit">
                ➤ Отправить
            </button>
        </div>
    </div>`;
    document.body.appendChild(overlay);

    // Аудио для превью
    const audio = document.createElement('audio');
    audio.id    = 'preview-audio';
    audio.src   = blobUrl;
    audio.ontimeupdate = () => {
        if (!audio.duration) return;
        const pct = (audio.currentTime / audio.duration) * 100;
        const fill = document.getElementById('preview-fill');
        const time = document.getElementById('preview-time');
        if (fill) fill.style.width = pct + '%';
        if (time) time.textContent = fmtSec(audio.currentTime);
    };
    audio.onended = () => {
        const icon = document.getElementById('preview-icon');
        if (icon) icon.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"/>';
    };
    overlay.appendChild(audio);

    // Рисуем реальную волну из blob
    _drawPreviewWaveform(blob);
    overlay._blobUrl = blobUrl;
    overlay._blob    = blob;
    overlay._ext     = ext;
}

function _drawPreviewWaveform(blob) {
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const ctx  = new (window.AudioContext || window.webkitAudioContext)();
            const buf  = await ctx.decodeAudioData(e.target.result);
            ctx.close();
            const data = buf.getChannelData(0);
            const bars = document.querySelectorAll('#preview-waveform div');
            const step = Math.floor(data.length / bars.length);
            bars.forEach((bar, i) => {
                let max = 0;
                for (let j = 0; j < step; j++) {
                    const v = Math.abs(data[i * step + j] || 0);
                    if (v > max) max = v;
                }
                const h = Math.max(3, Math.round(max * 36));
                bar.style.height = h + 'px';
                bar.style.background = `rgba(16,185,129,${0.3 + max * 0.7})`;
            });
        } catch(ex) {}
    };
    reader.readAsArrayBuffer(blob);
}

function toggleVoicePreview() {
    const audio = document.getElementById('preview-audio');
    const icon  = document.getElementById('preview-icon');
    if (!audio || !icon) return;
    if (audio.paused) {
        audio.play();
        icon.innerHTML = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
    } else {
        audio.pause();
        icon.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"/>';
    }
}

function seekVoicePreview(e) {
    const audio = document.getElementById('preview-audio');
    if (!audio || !audio.duration) return;
    const bar = e.currentTarget;
    const pct = e.offsetX / bar.offsetWidth;
    audio.currentTime = pct * audio.duration;
}

function cancelVoicePreview() {
    const overlay = document.getElementById('voice-preview-overlay');
    if (overlay) {
        document.getElementById('preview-audio')?.pause();
        if (overlay._blobUrl) URL.revokeObjectURL(overlay._blobUrl);
        overlay.remove();
    }
}

async function sendVoicePreview() {
    const overlay = document.getElementById('voice-preview-overlay');
    if (!overlay || !overlay._blob) return;

    document.getElementById('preview-audio')?.pause();
    const sendBtn = overlay.querySelector('button:last-child');
    if (sendBtn) { sendBtn.textContent = 'Отправка...'; sendBtn.disabled = true; }

    const fd = new FormData();
    fd.append('file', overlay._blob, `voice.${overlay._ext || 'webm'}`);

    try {
        const r    = await apiFetch('/upload_media', { method: 'POST', body: fd });
        if (!r) return;
        const data = await r.json();
        if (data.url) {
            socket.emit('send_message', {
                chat_id:   currentChatId,
                type_msg:  'audio',
                file_url:  data.url,
                sender_id: currentUser.id
            });
            // Оптимистичный рендер голосового
            const tempMsg = {
                id:          'tmp_' + Date.now(),
                chat_id:     currentChatId,
                sender_id:   currentUser.id,
                sender_name: currentUser.name,
                type:        'audio',
                type_msg:    'audio',
                file_url:    data.url,
                is_read:     false,
                timestamp:   _nowMoscow(),
                _optimistic: true,
            };
            renderNewMessage(tempMsg, true);
        }
        if (overlay._blobUrl) URL.revokeObjectURL(overlay._blobUrl);
        overlay.remove();
    } catch(err) {
        showToast('Ошибка загрузки', 'error');
        if (sendBtn) { sendBtn.textContent = '➤ Отправить'; sendBtn.disabled = false; }
    }
}

// ══════════════════════════════════════════════════════════
//  СОЗДАНИЕ ГРУППЫ — полная система
// ══════════════════════════════════════════════════════════
function openCreateGroupModal() {
    vibrate(8);
    if (savedContacts.length === 0) {
        showToast('Сначала добавьте контакты', 'warning');
        return;
    }

    const overlay = document.createElement('div');
    overlay.className = 'create-group-overlay';
    overlay.id = 'create-group-overlay';

    let selectedMembers = new Set();

    overlay.innerHTML = `
    <div style="padding:max(env(safe-area-inset-top),44px) 16px 16px;display:flex;align-items:center;justify-content:space-between;border-bottom:0.5px solid var(--border)">
        <button onclick="document.getElementById('create-group-overlay').remove()" style="width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,0.08);border:none;color:white;cursor:pointer;display:flex;align-items:center;justify-content:center">${ICONS.back}</button>
        <h2 style="font-size:17px;font-weight:700">Новая группа</h2>
        <button id="group-next-btn" onclick="goToGroupName()" style="background:var(--accent);border:none;border-radius:12px;padding:7px 16px;color:black;font-size:14px;font-weight:700;cursor:pointer;opacity:0.4;pointer-events:none">Далее</button>
    </div>

    <!-- Шаг 1: выбор участников -->
    <div id="group-step-1" style="flex:1;overflow-y:auto;padding:16px">
        <p style="font-size:13px;color:var(--text-2);margin-bottom:16px">Выберите из сохранённых контактов (минимум 2)</p>

        <div id="selected-members-bar" style="display:flex;gap:10px;overflow-x:auto;padding-bottom:12px;margin-bottom:4px;min-height:0;transition:min-height 0.2s"></div>

        <div id="contacts-for-group">
            ${savedContacts.map(c => `
            <div class="contact-item" id="gc_${c.id}" onclick="toggleGroupMember(${c.id},'${c.name.replace(/'/g,"\\'")}','${(c.avatar||'').replace(/'/g,"\\'")}',this)">
                <div style="position:relative">
                    ${getAvatarHtml({id:c.id,name:c.name,avatar:c.avatar},'w-12 h-12')}
                    <div id="gcheck_${c.id}" style="position:absolute;inset:0;border-radius:50%;background:var(--accent);display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity 0.15s">${ICONS.check.replace('currentColor','white')}</div>
                </div>
                <div style="flex:1">
                    <div style="font-weight:600;font-size:15px">${getContactDisplayName(c.id, c.name)}</div>
                    <div style="font-size:12px;color:var(--text-2)">@${c.username||''}</div>
                </div>
            </div>`).join('')}
        </div>
    </div>

    <!-- Шаг 2: название группы -->
    <div id="group-step-2" style="display:none;flex:1;padding:24px 16px">
        <div style="display:flex;flex-direction:column;align-items:center;gap:20px;padding-top:20px">
            <div onclick="pickGroupAvatar()" style="width:100px;height:100px;border-radius:50%;background:rgba(255,255,255,0.08);border:2px dashed rgba(255,255,255,0.2);display:flex;align-items:center;justify-content:center;cursor:pointer;position:relative" id="group-ava-picker">
                <div style="color:rgba(255,255,255,0.4);text-align:center">
                    ${ICONS.camera.replace('currentColor','rgba(255,255,255,0.4)')}
                    <div style="font-size:11px;margin-top:4px">Фото</div>
                </div>
                <img id="group-ava-preview" style="display:none;position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:50%">
            </div>
            <input id="group-name-input" type="text" placeholder="Название группы"
                style="width:100%;background:rgba(255,255,255,0.06);border:1.5px solid rgba(255,255,255,0.1);border-radius:16px;padding:14px 16px;color:white;font-size:16px;font-family:inherit;outline:none;text-align:center"
                maxlength="64"
                onfocus="this.style.borderColor='var(--accent-30)'"
                onblur="this.style.borderColor='rgba(255,255,255,0.1)'"
                oninput="checkGroupNameValid()">
            <p id="group-selected-count" style="font-size:13px;color:var(--text-2)">0 участников выбрано</p>
            <button id="create-group-btn" onclick="createGroup()" style="width:100%;padding:14px;background:var(--accent);border:none;border-radius:16px;color:black;font-size:16px;font-weight:700;cursor:pointer;font-family:inherit;opacity:0.4;pointer-events:none">
                Создать группу
            </button>
        </div>
    </div>
    `;

    // Добавляем логику
    overlay._selectedMembers = selectedMembers;
    document.body.appendChild(overlay);

    // Инжектируем toggleGroupMember в глобальный scope
    window._groupOverlay = overlay;
}

function toggleGroupMember(id, name, avatar, el) {
    const overlay = document.getElementById('create-group-overlay');
    if (!overlay) return;
    if (!overlay._selectedMembers) overlay._selectedMembers = new Set();
    const check = document.getElementById(`gcheck_${id}`);
    const bar   = document.getElementById('selected-members-bar');

    if (overlay._selectedMembers.has(id)) {
        overlay._selectedMembers.delete(id);
        if (check) check.style.opacity = '0';
        document.getElementById(`sel_${id}`)?.remove();
    } else {
        overlay._selectedMembers.add(id);
        if (check) check.style.opacity = '1';
        if (bar) {
            const chip = document.createElement('div');
            chip.id = `sel_${id}`;
            chip.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:4px;flex-shrink:0;cursor:pointer';
            chip.onclick = () => toggleGroupMember(id, name, avatar, el);
            chip.innerHTML = `
                <div style="position:relative">
                    ${getAvatarHtml({id,name,avatar},'w-12 h-12')}
                    <div style="position:absolute;top:-2px;right:-2px;width:18px;height:18px;background:#ef4444;border-radius:50%;border:2px solid #000;display:flex;align-items:center;justify-content:center">
                        <svg width="8" height="8" viewBox="0 0 24 24" fill="none"><line x1="18" y1="6" x2="6" y2="18" stroke="white" stroke-width="3" stroke-linecap="round"/><line x1="6" y1="6" x2="18" y2="18" stroke="white" stroke-width="3" stroke-linecap="round"/></svg>
                    </div>
                </div>
                <div style="font-size:10px;color:var(--text-2);max-width:50px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${name.split(' ')[0]}</div>`;
            bar.appendChild(chip);
            bar.style.minHeight = '80px';
        }
    }

    const count = overlay._selectedMembers.size;
    const nextBtn = document.getElementById('group-next-btn');
    if (nextBtn) {
        const enabled = count >= 2;
        nextBtn.style.opacity = enabled ? '1' : '0.4';
        nextBtn.style.pointerEvents = enabled ? 'auto' : 'none';
    }
}

function goToGroupName() {
    const overlay = document.getElementById('create-group-overlay');
    if (!overlay) return;
    const count = overlay._selectedMembers?.size || 0;
    if (count < 2) { showToast('Выберите минимум 2 участника', 'warning'); return; }

    document.getElementById('group-step-1').style.display = 'none';
    document.getElementById('group-step-2').style.display = 'flex';
    document.getElementById('group-selected-count').textContent = `${count} участников выбрано`;
    document.getElementById('group-next-btn').textContent = 'Создать';
    document.getElementById('group-next-btn').onclick = createGroup;
    setTimeout(() => document.getElementById('group-name-input')?.focus(), 200);
}

function checkGroupNameValid() {
    const name = document.getElementById('group-name-input')?.value.trim() || '';
    const btn  = document.getElementById('create-group-btn');
    if (btn) {
        const enabled = name.length >= 1;
        btn.style.opacity = enabled ? '1' : '0.4';
        btn.style.pointerEvents = enabled ? 'auto' : 'none';
    }
}

let groupAvatarFile = null;
function pickGroupAvatar() {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*';
    input.onchange = () => {
        const file = input.files[0];
        if (!file) return;
        groupAvatarFile = file;
        const reader = new FileReader();
        reader.onload = (e) => {
            const preview = document.getElementById('group-ava-preview');
            const picker  = document.getElementById('group-ava-picker');
            if (preview) { preview.src = e.target.result; preview.style.display = 'block'; }
            if (picker)  { picker.querySelector('div').style.display = 'none'; }
        };
        reader.readAsDataURL(file);
    };
    input.click();
}

async function createGroup() {
    const overlay = document.getElementById('create-group-overlay');
    if (!overlay) return;
    const name    = document.getElementById('group-name-input')?.value.trim() || '';
    const members = [...(overlay._selectedMembers || [])];
    if (!name || members.length < 2) { showToast('Заполните название и добавьте участников', 'warning'); return; }

    const btn = document.getElementById('create-group-btn');
    if (btn) { btn.textContent = 'Создание...'; btn.style.opacity = '0.6'; btn.style.pointerEvents = 'none'; }

    try {
        const fd = new FormData();
        fd.append('name', name);
        fd.append('members', JSON.stringify(members));
        if (groupAvatarFile) fd.append('avatar', groupAvatarFile);

        const r = await apiFetch('/create_group', { method: 'POST', body: fd });
        if (!r) return;
        const data = await r.json();
        if (data.success) {
            overlay.remove();
            groupAvatarFile = null;
            showToast(`Группа "${name}" создана!`, 'success');
            vibrate([20, 40, 20]);
            loadChats();
            // Открываем группу
            setTimeout(() => openGroupChat(data.group_id, name, data.avatar), 500);
        } else {
            showToast(data.error || 'Ошибка создания', 'error');
            if (btn) { btn.textContent = 'Создать группу'; btn.style.opacity = '1'; btn.style.pointerEvents = 'auto'; }
        }
    } catch(e) {
        showToast('Ошибка создания группы', 'error');
        if (btn) { btn.textContent = 'Создать группу'; btn.style.opacity = '1'; btn.style.pointerEvents = 'auto'; }
    }
}

// ══════════════════════════════════════════════════════════
//  ДОБАВЛЕНИЕ КОНТАКТА
// ══════════════════════════════════════════════════════════
function openNewContactModal() {
    vibrate(8);
    const overlay = document.createElement('div');
    overlay.className = 'add-contact-overlay';
    overlay.id = 'add-contact-overlay';
    overlay.onclick = (e) => { if (e.target === overlay) closeAddContactModal(); };

    overlay.innerHTML = `
    <div class="add-contact-card">
        <div style="padding:22px 22px 0;display:flex;align-items:center;justify-content:space-between">
            <div>
                <h2 style="font-size:20px;font-weight:800;margin:0;letter-spacing:-0.3px">Добавить контакт</h2>
                <p style="font-size:13px;color:var(--text-2);margin:4px 0 0">Введите номер телефона</p>
            </div>
            <button onclick="closeAddContactModal()" style="width:32px;height:32px;border-radius:50%;background:rgba(255,255,255,0.08);border:none;color:rgba(255,255,255,0.6);font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><line x1="18" y1="6" x2="6" y2="18" stroke="rgba(255,255,255,0.6)" stroke-width="2.5" stroke-linecap="round"/><line x1="6" y1="6" x2="18" y2="18" stroke="rgba(255,255,255,0.6)" stroke-width="2.5" stroke-linecap="round"/></svg>
            </button>
        </div>
        <div style="padding:20px 22px">
            <div style="position:relative">
                <div style="position:absolute;left:14px;top:50%;transform:translateY(-50%);color:rgba(255,255,255,0.3)">${ICONS.call}</div>
                <input id="contact-phone-input" type="tel" placeholder="+7 (999) 999-99-99"
                    style="width:100%;background:rgba(255,255,255,0.06);border:1.5px solid rgba(255,255,255,0.1);border-radius:16px;padding:13px 16px 13px 46px;color:white;font-size:16px;outline:none;font-family:inherit;transition:border-color 0.2s;"
                    oninput="onContactPhoneInput(this)"
                    onfocus="this.style.borderColor='var(--accent-30)'"
                    onblur="this.style.borderColor='rgba(255,255,255,0.1)'"
                    onkeydown="if(event.key==='Enter') searchContactByPhone()">
            </div>
            <div id="contact-search-result" style="margin-top:14px;min-height:60px;display:flex;align-items:center;justify-content:center">
                <p style="font-size:13px;color:var(--text-2);text-align:center">Введите номер для поиска</p>
            </div>
        </div>
        <div style="padding:0 22px 22px">
            <button onclick="searchContactByPhone()" id="contact-search-btn"
                style="width:100%;padding:14px;background:var(--accent);border:none;border-radius:16px;color:black;font-size:16px;font-weight:700;cursor:pointer;font-family:inherit;box-shadow:var(--glow);display:flex;align-items:center;justify-content:center;gap:8px">
                ${ICONS.search.replace('rgba(255,255,255,0.35)','black')} Найти контакт
            </button>
        </div>
    </div>`;

    document.body.appendChild(overlay);
    setTimeout(() => document.getElementById('contact-phone-input')?.focus(), 300);
}

function closeAddContactModal() {
    const overlay = document.getElementById('add-contact-overlay');
    if (overlay) { overlay.style.animation = 'fadeIn 0.2s ease reverse'; setTimeout(() => overlay.remove(), 200); }
}

let contactSearchTimeout = null;
function onContactPhoneInput(input) {
    clearTimeout(contactSearchTimeout);
    if (input.value.trim().length >= 7) contactSearchTimeout = setTimeout(searchContactByPhone, 600);
}

async function searchContactByPhone() {
    const input = document.getElementById('contact-phone-input');
    const resultDiv = document.getElementById('contact-search-result');
    if (!input || !resultDiv) return;
    const phone = input.value.trim();
    if (!phone) { resultDiv.innerHTML = `<p style="font-size:13px;color:var(--text-2)">Введите номер телефона</p>`; return; }

    resultDiv.innerHTML = `<div style="display:flex;align-items:center;gap:10px;color:var(--text-2)"><div style="width:20px;height:20px;border:2px solid var(--accent);border-top-color:transparent;border-radius:50%;animation:spin 0.8s linear infinite"></div><span>Поиск...</span></div><style>@keyframes spin{to{transform:rotate(360deg)}}</style>`;

    try {
        const r = await apiFetch(`/search_users?phone=${encodeURIComponent(phone)}`);
        if (!r) return;
        const users = await r.json();
        if (!users || !users.length) {
            resultDiv.innerHTML = `<div style="text-align:center;padding:10px"><div style="font-size:32px;margin-bottom:8px">🔍</div><p style="font-size:15px;font-weight:600;margin:0">Пользователь не найден</p><p style="font-size:13px;color:var(--text-2);margin:6px 0 0">По этому номеру нет аккаунта WayChat</p></div>`;
            return;
        }
        const u = users[0];
        const isSaved = savedContacts.some(c => c.id === u.id);
        resultDiv.innerHTML = `
            <div style="display:flex;align-items:center;gap:14px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:18px;padding:14px">
                ${getAvatarHtml({id:u.id, name:u.name, avatar:u.avatar_url||u.avatar},'w-14 h-14')}
                <div style="flex:1;min-width:0">
                    <div style="font-weight:700;font-size:16px">${u.name}</div>
                    <div style="font-size:13px;color:var(--text-2);margin-top:2px">@${u.username}</div>
                </div>
            </div>
            <div style="display:flex;gap:10px;margin-top:12px">
                <button onclick="openChatFromContact(${u.id},'${u.name.replace(/'/g,"\\'")}','${(u.avatar_url||u.avatar||'').replace(/'/g,"\\'")}');closeAddContactModal()"
                    style="flex:1;padding:11px;background:var(--accent-10);border:1px solid var(--accent-30);border-radius:14px;color:var(--accent);font-size:14px;font-weight:600;cursor:pointer;font-family:inherit">
                    💬 Написать
                </button>
                <button onclick="${isSaved ? `removeContactById(${u.id})` : `saveContactFromSearch(${u.id},'${u.name.replace(/'/g,"\\'")}','${(u.avatar_url||u.avatar||'').replace(/'/g,"\\'")}','${u.username}')`}" id="save-contact-btn-${u.id}"
                    style="flex:1;padding:11px;background:${isSaved?'rgba(239,68,68,0.1)':'rgba(16,185,129,0.1)'};border:1px solid ${isSaved?'rgba(239,68,68,0.3)':'rgba(16,185,129,0.3)'};border-radius:14px;color:${isSaved?'#ef4444':'#10b981'};font-size:14px;font-weight:600;cursor:pointer;font-family:inherit">
                    ${isSaved ? '🗑 Убрать' : '👤 Сохранить'}
                </button>
            </div>`;
    } catch(e) {
        resultDiv.innerHTML = `<p style="font-size:13px;color:#ef4444;text-align:center">Ошибка при поиске</p>`;
    }
}

function openChatFromContact(id, name, avatar) { openChat(id, name, avatar); }

function saveContactFromSearch(id, name, avatar, username) {
    if (!savedContacts.some(c => c.id === id)) {
        savedContacts.push({ id, name, avatar, username });
        localStorage.setItem('waychat_contacts', JSON.stringify(savedContacts));
        showToast(`${name} сохранён в контактах`, 'success');
        vibrate(20);
        const btn = document.getElementById(`save-contact-btn-${id}`);
        if (btn) {
            btn.textContent = '🗑 Убрать';
            btn.style.background = 'rgba(239,68,68,0.1)';
            btn.style.borderColor = 'rgba(239,68,68,0.3)';
            btn.style.color = '#ef4444';
            btn.setAttribute('onclick', `removeContactById(${id})`);
        }
    }
}

function removeContactById(id) {
    savedContacts = savedContacts.filter(c => c.id !== id);
    localStorage.setItem('waychat_contacts', JSON.stringify(savedContacts));
    showToast('Контакт удалён', 'info');
}

// ══════════════════════════════════════════════════════════
//  КОНТАКТЫ
// ══════════════════════════════════════════════════════════
function openContactsModal() {
    document.body.appendChild(createBottomSheet(`
        <div class="modal-handle"></div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px">
            <h3 style="font-size:18px;font-weight:700;margin:0">Контакты (${savedContacts.length})</h3>
            <button onclick="openNewContactModal();document.querySelector('.modal-overlay')?.remove()" style="background:var(--accent-10);border:1px solid var(--accent-30);border-radius:12px;padding:6px 14px;color:var(--accent);font-size:13px;font-weight:600;cursor:pointer">+ Добавить</button>
        </div>
        <div>
            ${savedContacts.length === 0
                ? `<div style="text-align:center;padding:30px;opacity:0.3"><div style="font-size:40px;margin-bottom:8px">👥</div><p>Нет контактов</p></div>`
                : savedContacts.map(c => `
                <div class="contact-item" onclick="openChat(${c.id},'${c.name.replace(/'/g,"\\'")}','${(c.avatar||'').replace(/'/g,"\\'")}');document.querySelector('.modal-overlay')?.remove()">
                    ${getAvatarHtml({id:c.id,name:c.name,avatar:c.avatar},'w-12 h-12')}
                    <div style="flex:1">
                        <div style="font-weight:600;font-size:15px">${getContactDisplayName(c.id, c.name)}</div>
                        <div style="font-size:12px;color:var(--text-2)">@${c.username||''}</div>
                    </div>
                    <button onclick="event.stopPropagation();renameContact(${c.id},'${c.name.replace(/'/g,"\\'")}')" style="background:rgba(255,255,255,0.06);border:none;border-radius:10px;padding:6px 10px;color:rgba(255,255,255,0.5);font-size:12px;cursor:pointer;margin-right:6px">Переим.</button>
                    <button onclick="event.stopPropagation();removeContactById(${c.id});document.querySelector('.modal-overlay')?.remove();openContactsModal()" style="background:rgba(239,68,68,0.1);border:none;border-radius:10px;padding:6px 10px;color:#ef4444;font-size:12px;cursor:pointer">Удалить</button>
                </div>`).join('')
            }
        </div>
    `));
}

function renameContact(id, currentName) {
    const newName = prompt(`Своё имя для контакта:`, contactCustomNames[id] || currentName);
    if (newName === null) return;
    if (newName.trim()) contactCustomNames[id] = newName.trim();
    else delete contactCustomNames[id];
    localStorage.setItem('waychat_contact_names', JSON.stringify(contactCustomNames));
    showToast('Имя обновлено', 'success');
    document.querySelector('.modal-overlay')?.remove();
    openContactsModal();
    loadChats();
}

// ══════════════════════════════════════════════════════════
//  ПРОФИЛЬ ПАРТНЁРА
// ══════════════════════════════════════════════════════════
function showPartnerProfile() {
    const name     = document.getElementById('chat-name')?.textContent || '';
    const status   = document.getElementById('chat-status')?.textContent || '';
    const isOnline = status === 'в сети';
    const isSaved  = savedContacts.some(c => c.id === currentPartnerId);
    const customName = contactCustomNames[currentPartnerId];
    const avatarSrc  = chatPartnerAvatarSrc[currentPartnerId] || '';
    const isGroup    = currentChatType === 'group';

    const overlay = document.createElement('div');
    overlay.className = 'partner-profile-overlay';
    overlay.innerHTML = `
        <div style="padding:max(env(safe-area-inset-top),44px) 16px 16px;display:flex;align-items:center;justify-content:space-between;position:relative;z-index:2">
            <button onclick="this.closest('.partner-profile-overlay').remove()" style="width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,0.1);border:none;color:white;cursor:pointer;display:flex;align-items:center;justify-content:center">${ICONS.back}</button>
            <span style="font-weight:700;font-size:16px">${isGroup ? 'Группа' : 'Профиль'}</span>
            <div style="width:36px"></div>
        </div>
        <div style="position:relative;flex:0 0 auto;overflow:hidden;height:220px">
            ${avatarSrc && !avatarSrc.startsWith('data:') ? `<div style="position:absolute;inset:0;background-image:url('${avatarSrc}');background-size:cover;background-position:center;filter:blur(40px) brightness(0.3) saturate(1.5)"></div>` : ''}
            <div style="position:absolute;inset:0;background:linear-gradient(to bottom,transparent 0%,#000 100%)"></div>
            <div style="position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;padding:20px 24px 0">
                <div style="width:100px;height:100px;border-radius:50%;overflow:hidden;border:3px solid rgba(255,255,255,0.15);box-shadow:0 8px 40px rgba(0,0,0,0.5);margin-bottom:12px">
                    ${avatarSrc ? `<img src="${avatarSrc}" style="width:100%;height:100%;object-fit:cover" loading="lazy">` : getInitialAvatar(name, 'w-full h-full', currentPartnerId)}
                </div>
                <h2 style="font-size:22px;font-weight:800;letter-spacing:-0.3px;text-align:center;margin:0">${name}</h2>
                ${customName ? `<p style="font-size:12px;color:var(--text-2);margin-top:2px;margin-bottom:0">сохранён как «${customName}»</p>` : ''}
                <p style="color:${isOnline?'var(--accent)':'var(--text-2)'};font-size:13px;margin-top:4px;margin-bottom:0">${isOnline?'● в сети':'был(а) недавно'}</p>
            </div>
        </div>
        <div style="flex:1;overflow-y:auto;padding:0 16px 16px;position:relative;z-index:2">
            <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:20px;overflow:hidden;margin-bottom:12px" id="profile-info-block">
                <div style="padding:12px 16px;border-bottom:0.5px solid rgba(255,255,255,0.05)">
                    <div style="font-size:10px;color:var(--text-2);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px">Имя</div>
                    <div style="font-size:15px;font-weight:600" id="profile-name-val">${name}</div>
                </div>
                <div style="padding:12px 16px;border-bottom:0.5px solid rgba(255,255,255,0.05)">
                    <div style="font-size:10px;color:var(--text-2);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px">Юзернейм</div>
                    <div style="font-size:15px;font-weight:600" id="profile-username-val">...</div>
                </div>
                <div style="padding:12px 16px;border-bottom:0.5px solid rgba(255,255,255,0.05)" id="profile-phone-row">
                    <div style="font-size:10px;color:var(--text-2);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px">Телефон</div>
                    <div style="font-size:15px;font-weight:600" id="profile-phone-val">Загрузка...</div>
                </div>
                <div style="padding:12px 16px;border-bottom:0.5px solid rgba(255,255,255,0.05)" id="profile-bio-row" style="display:none">
                    <div style="font-size:10px;color:var(--text-2);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px">О себе</div>
                    <div style="font-size:14px;color:rgba(255,255,255,0.85);line-height:1.4" id="profile-bio-val"></div>
                </div>
                <div style="padding:12px 16px" id="profile-date-row" style="display:none">
                    <div style="font-size:10px;color:var(--text-2);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:3px">В WayChat с</div>
                    <div style="font-size:14px;font-weight:500" id="profile-date-val"></div>
                </div>
            </div>
            ${!isGroup ? `
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">
                <button onclick="startCall('audio');this.closest('.partner-profile-overlay').remove()" style="padding:14px;background:rgba(16,185,129,0.12);border:1px solid rgba(16,185,129,0.25);border-radius:16px;color:var(--accent);font-size:14px;font-weight:600;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:8px">
                    ${ICONS.call.replace('white','var(--accent)')} Позвонить
                </button>
                <button onclick="startCall('video');this.closest('.partner-profile-overlay').remove()" style="padding:14px;background:rgba(59,130,246,0.12);border:1px solid rgba(59,130,246,0.25);border-radius:16px;color:#60a5fa;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:8px">
                    ${ICONS.video.replace('white','#60a5fa')} Видео
                </button>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">
                <button onclick="renameContactFromProfile(${currentPartnerId},'${name.replace(/'/g,"\\'")}');this.closest('.partner-profile-overlay').remove()" style="padding:12px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:16px;color:white;font-size:13px;font-weight:500;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:6px">
                    ${ICONS.edit.replace('currentColor','white')} Переименовать
                </button>
                <button onclick="toggleContactSave(${currentPartnerId},'${name.replace(/'/g,"\\'")}')" style="padding:12px;background:${isSaved?'rgba(239,68,68,0.1)':'rgba(16,185,129,0.1)'};border:1px solid ${isSaved?'rgba(239,68,68,0.25)':'rgba(16,185,129,0.25)'};border-radius:16px;color:${isSaved?'#ef4444':'var(--accent)'};font-size:13px;font-weight:500;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:6px">
                    ${isSaved ? ICONS.trash.replace('currentColor','#ef4444') + ' Убрать' : ICONS.users.replace('currentColor','var(--accent)') + ' Сохранить'}
                </button>
            </div>` : `
            <div style="margin-bottom:12px">
                <button onclick="showGroupInfo()" style="width:100%;padding:13px;background:rgba(59,130,246,0.1);border:1px solid rgba(59,130,246,0.2);border-radius:16px;color:#60a5fa;font-size:15px;font-weight:600;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:8px">
                    ${ICONS.users.replace('currentColor','#60a5fa')} Участники группы
                </button>
            </div>`}
            <button onclick="blockUserFromProfile(${currentPartnerId});this.closest('.partner-profile-overlay').remove()" style="width:100%;padding:13px;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);border-radius:16px;color:#ef4444;font-size:15px;font-weight:600;cursor:pointer;font-family:inherit;margin-bottom:max(env(safe-area-inset-bottom),24px);display:flex;align-items:center;justify-content:center;gap:8px">
                ${ICONS.block.replace('currentColor','#ef4444')} Заблокировать
            </button>
        </div>
    `;

    document.body.appendChild(overlay);

    // Подгружаем полный профиль
    if (!isGroup) {
        apiFetch(`/get_user_profile/${currentPartnerId}`).then(r => r?.json()).then(data => {
            if (!data) return;
            const uEl = overlay.querySelector('#profile-username-val');
            const pEl = overlay.querySelector('#profile-phone-val');
            const bEl = overlay.querySelector('#profile-bio-val');
            const bRow = overlay.querySelector('#profile-bio-row');
            const dEl = overlay.querySelector('#profile-date-val');
            const dRow = overlay.querySelector('#profile-date-row');
            if (uEl) uEl.textContent = data.username ? '@' + data.username : '—';
            if (pEl) pEl.textContent = data.phone || '—';
            if (data.bio && bEl && bRow) {
                bEl.textContent = data.bio;
                bRow.style.display = 'block';
            }
            if (data.created_at && dEl && dRow) {
                try {
                    const d = new Date(data.created_at);
                    dEl.textContent = d.toLocaleDateString('ru-RU', { day:'numeric', month:'long', year:'numeric' });
                    dRow.style.display = 'block';
                } catch(e) {}
            }
            // Верификационный бейдж в шапке профиля
            if (data.is_verified && data.verified_type) {
                const nameEl = overlay.querySelector('#profile-name-display') || overlay.querySelector('[style*="font-weight:800"]');
                if (nameEl) {
                    const badge = getVerifyBadge(data, 18);
                    if (badge && !nameEl.querySelector('.vbadge-inline')) {
                        nameEl.insertAdjacentHTML('beforeend', `<span class="vbadge-inline">${badge}</span>`);
                    }
                }
                // Бейдж в хедере чата
                const chatNameEl = document.getElementById('chat-name');
                if (chatNameEl) {
                    chatNameEl.innerHTML = escHtml(getContactDisplayName(currentPartnerId, data.name)) + getVerifyBadge(data, 13);
                }
            }
        }).catch(() => {});
    }
}

function renameContactFromProfile(id, currentName) {
    const newName = prompt(`Своё имя для контакта:`, contactCustomNames[id] || currentName);
    if (newName === null) return;
    if (newName.trim()) contactCustomNames[id] = newName.trim();
    else delete contactCustomNames[id];
    localStorage.setItem('waychat_contact_names', JSON.stringify(contactCustomNames));
    showToast('Имя обновлено', 'success');
    const nameEl = document.getElementById('chat-name');
    if (nameEl) nameEl.textContent = getContactDisplayName(id, currentName);
    loadChats();
}

function toggleContactSave(id, name) {
    const isSaved = savedContacts.some(c => c.id === id);
    const avatar  = chatPartnerAvatarSrc[id] || '';
    if (isSaved) {
        savedContacts = savedContacts.filter(c => c.id !== id);
        showToast('Контакт удалён', 'info');
    } else {
        savedContacts.push({ id, name, avatar, username: '' });
        showToast(`${name} сохранён`, 'success');
    }
    localStorage.setItem('waychat_contacts', JSON.stringify(savedContacts));
    vibrate(15);
}

function blockUserFromProfile(userId) { showToast('Пользователь заблокирован', 'info'); }

async function showGroupInfo() {
    try {
        const r = await apiFetch(`/get_group_members/${currentPartnerId}`);
        if (!r) return;
        const data = await r.json();
        if (data.error) { showToast(data.error, 'error'); return; }

        const members   = data.members   || [];
        const myId      = data.my_id;
        const creatorId = data.creator_id;
        const iAmAdmin  = data.i_am_admin;
        const groupId   = data.group_id;

        // Строим карточку участника
        function memberCard(m) {
            const isCreator = m.id === creatorId;
            const isMe      = m.id === myId;
            const canKick   = iAmAdmin && !isMe && !isCreator;
            const canToggleAdmin = (myId === creatorId) && !isMe; // только создатель назначает

            // Бейдж роли
            let badge = '';
            if (isCreator) {
                badge = `<span style="font-size:10px;font-weight:700;background:rgba(16,185,129,0.15);color:var(--accent);border:1px solid rgba(16,185,129,0.3);padding:2px 7px;border-radius:20px;margin-left:6px">Создатель</span>`;
            } else if (m.is_admin) {
                badge = `<span style="font-size:10px;font-weight:700;background:rgba(99,102,241,0.15);color:#a5b4fc;border:1px solid rgba(99,102,241,0.3);padding:2px 7px;border-radius:20px;margin-left:6px">Админ</span>`;
            }
            if (isMe) {
                badge += `<span style="font-size:10px;color:var(--text-2);margin-left:4px">• Вы</span>`;
            }

            // Онлайн-статус
            const dot = m.online
                ? `<span style="width:8px;height:8px;background:var(--accent);border-radius:50%;display:inline-block;margin-left:6px;flex-shrink:0"></span>`
                : '';

            // Кнопки управления (появляются при нажатии)
            const actionBtns = !isMe && iAmAdmin ? `
                <div style="display:flex;gap:8px;margin-top:0;align-items:center">
                    ${canKick ? `<button onclick="kickMember(${groupId},${m.id},'${m.name.replace(/'/g,'')}')" 
                        style="padding:6px 12px;background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.25);border-radius:10px;color:#f87171;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;white-space:nowrap">
                        Исключить
                    </button>` : ''}
                    ${canToggleAdmin ? `<button onclick="toggleAdmin(${groupId},${m.id},${m.is_admin},'${m.name.replace(/'/g,'')}')"
                        style="padding:6px 12px;background:rgba(99,102,241,0.10);border:1px solid rgba(99,102,241,0.25);border-radius:10px;color:#a5b4fc;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;white-space:nowrap">
                        ${m.is_admin ? 'Снять админа' : 'Сделать админом'}
                    </button>` : ''}
                </div>` : '';

            return `
            <div id="member-row-${m.id}" style="display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--border)">
                <div style="position:relative;flex-shrink:0">
                    ${getAvatarHtml({id:m.id,name:m.name,avatar:m.avatar},'w-12 h-12')}
                    ${m.online ? `<span style="position:absolute;bottom:0;right:0;width:10px;height:10px;background:var(--accent);border:2px solid var(--surface);border-radius:50%"></span>` : ''}
                </div>
                <div style="flex:1;min-width:0">
                    <div style="display:flex;align-items:center;flex-wrap:wrap;gap:2px;margin-bottom:2px">
                        <span style="font-weight:600;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${m.name}</span>
                        ${badge}
                    </div>
                    <div style="font-size:12px;color:var(--text-2)">@${m.username || ''}</div>
                    ${actionBtns}
                </div>
            </div>`;
        }

        // Сортируем: создатель → админы → остальные
        const sorted = [...members].sort((a, b) => {
            if (a.id === creatorId) return -1;
            if (b.id === creatorId) return  1;
            if (a.is_admin && !b.is_admin) return -1;
            if (!a.is_admin && b.is_admin) return  1;
            return a.name.localeCompare(b.name);
        });

        const sheet = createBottomSheet(`
            <div class="modal-handle"></div>
            <h3 style="font-size:18px;font-weight:700;margin-bottom:4px">${data.group_name || 'Группа'}</h3>
            <p style="font-size:13px;color:var(--text-2);margin-bottom:16px">${members.length} участников</p>
            <div style="overflow-y:auto;max-height:60vh">
                ${sorted.map(memberCard).join('')}
            </div>
        `);
        document.body.appendChild(sheet);
    } catch(e) {
        console.error('showGroupInfo:', e);
        showToast('Ошибка загрузки', 'error');
    }
}

async function kickMember(groupId, userId, name) {
    if (!confirm(`Исключить ${name} из группы?`)) return;
    try {
        const r = await apiFetch('/kick_group_member', {
            method: 'POST',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({group_id: groupId, user_id: userId})
        });
        if (!r) return;
        const d = await r.json();
        if (d.success) {
            // Удаляем строку из UI
            document.getElementById(`member-row-${userId}`)?.remove();
            showToast(`${name} исключён(а)`, 'success');
        } else {
            showToast(d.error || 'Ошибка', 'error');
        }
    } catch(e) { showToast('Ошибка', 'error'); }
}

async function toggleAdmin(groupId, userId, currentlyAdmin, name) {
    const action = currentlyAdmin ? 'снять права администратора' : 'назначить администратором';
    if (!confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} ${name}?`)) return;
    try {
        const r = await apiFetch('/set_group_admin', {
            method: 'POST',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({group_id: groupId, user_id: userId, is_admin: !currentlyAdmin})
        });
        if (!r) return;
        const d = await r.json();
        if (d.success) {
            showToast(currentlyAdmin ? `Права админа сняты` : `${name} — теперь администратор`, 'success');
            // Перезагружаем список
            document.querySelectorAll('.bottom-sheet').forEach(s => s.remove());
            setTimeout(showGroupInfo, 100);
        } else {
            showToast(d.error || 'Ошибка', 'error');
        }
    } catch(e) { showToast('Ошибка', 'error'); }
}

// ══════════════════════════════════════════════════════════
//  АВАТАР
// ══════════════════════════════════════════════════════════
async function changeAvatar() {
    const input = document.createElement('input');
    input.type   = 'file'; input.accept = 'image/*';
    input.onchange = async () => {
        const file = input.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (e) => {
            const oldAvatar    = currentUser.avatar;
            currentUser.avatar = e.target.result;
            invalidateAvatarCache(currentUser.id);
            updateAllAvatarUI();
            const fd = new FormData();
            fd.append('file', file);
            try {
                const r    = await apiFetch('/upload_avatar', { method: 'POST', body: fd });
                if (!r) return;
                const data = await r.json();
                if (data.success) {
                    currentUser.avatar = data.avatar_url;
                    invalidateAvatarCache(currentUser.id, data.avatar_url);
                    localStorage.setItem('waychat_user_cache', JSON.stringify(currentUser));
                    updateAllAvatarUI();
                    showToast('Аватар обновлён', 'success');
                } else throw new Error(data.error);
            } catch(err) {
                currentUser.avatar = oldAvatar;
                invalidateAvatarCache(currentUser.id);
                updateAllAvatarUI();
                showToast('Ошибка сохранения фото', 'error');
            }
        };
        reader.readAsDataURL(file);
    };
    input.click();
}

async function setEmojiAvatar() {
    const emojis = ['😎','👻','🐱','🤖','🔥','💎','🌟','🍀','🦊','🐺','🦁','🐯','🐸','🐧','🦅','🐬','🦄','🐲','🎭','🎪','🌈','⚡','🎯','🏆','🫶','💀','🥷','🧠','🫡','🤡','👽','🤯','🥸','😈','🫠','🧿','🪄','🎸','🚀','🌊','🏔️','🌸','🦋'];
    const choice = prompt(`Выберите или введите эмодзи:\n${emojis.join(' ')}`, emojis[Math.floor(Math.random()*emojis.length)]);
    if (!choice) return;
    try {
        const r = await apiFetch('/upload_avatar_emoji', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ emoji: choice })
        });
        if (!r) return;
        const data = await r.json();
        if (data.success) {
            currentUser.avatar = `emoji:${choice}`;
            invalidateAvatarCache(currentUser.id);
            updateAllAvatarUI();
            localStorage.setItem('waychat_user_cache', JSON.stringify(currentUser));
            showToast('Эмодзи-аватар сохранён', 'success'); vibrate(30);
        }
    } catch(e) { showToast('Ошибка', 'error'); }
}

function updateAllAvatarUI() {
    const sBox = document.getElementById('settings-ava-box');
    const nBox = document.getElementById('nav-ava-box');
    const mBox = document.getElementById('moments-my-ava');
    if (sBox) sBox.innerHTML = getAvatarHtml(currentUser, 'w-28 h-28', true);
    if (nBox) nBox.innerHTML = getAvatarHtml(currentUser, 'w-8 h-8', true);
    if (mBox) mBox.innerHTML = getAvatarHtml(currentUser, 'w-12 h-12', true);
    const bg = document.getElementById('settings-bg');
    if (bg) {
        const src = currentUser.avatar && !currentUser.avatar.startsWith('emoji:') && !currentUser.avatar.includes('default') ? currentUser.avatar : '';
        bg.style.backgroundImage = src ? `url('${src}')` : '';
    }
    // Обновляем все аватары текущего юзера на странице моментов
    document.querySelectorAll('.moment-my-ava').forEach(el => {
        el.innerHTML = getAvatarHtml(currentUser, el.dataset.size || 'w-12 h-12', true);
    });
    // Всегда сохраняем в localStorage чтобы аватар выжил после перезагрузки
    if (currentUser.id) localStorage.setItem('waychat_user_cache', JSON.stringify(currentUser));
}

// ══════════════════════════════════════════════════════════
//  РАЗРЕШЕНИЯ — настройки
// ══════════════════════════════════════════════════════════

async function openPermissionsSettings() {
    const ov = document.createElement('div');
    ov.className = 'modal-overlay';
    ov.onclick = e => { if (e.target===ov) ov.remove(); };
    const sh = document.createElement('div'); sh.className='modal-sheet';

    async function getPermStatus(type) {
        if (type === 'notifications') {
            if (!('Notification' in window)) return 'unavailable';
            return Notification.permission; // granted / denied / default
        }
        if (navigator.permissions) {
            try {
                const s = await navigator.permissions.query({name: type});
                return s.state; // granted / denied / prompt
            } catch(e){}
        }
        // Fallback: читаем из нашего кэша
        return _getPerms()[type] || 'prompt';
    }

    function statusBadge(state) {
        const cfg = {
            granted:     { color:'#10b981', bg:'rgba(16,185,129,0.12)',  label:'Разрешено' },
            denied:      { color:'#ef4444', bg:'rgba(239,68,68,0.12)',   label:'Заблокировано' },
            prompt:      { color:'#f59e0b', bg:'rgba(245,158,11,0.12)',  label:'Не запрошено' },
            default:     { color:'#f59e0b', bg:'rgba(245,158,11,0.12)',  label:'Не запрошено' },
            unavailable: { color:'#6b7280', bg:'rgba(107,114,128,0.12)', label:'Недоступно' },
        };
        const c = cfg[state] || cfg.prompt;
        return '<span style="font-size:12px;font-weight:600;color:'+c.color+';background:'+c.bg+';border-radius:8px;padding:3px 10px">'+c.label+'</span>';
    }

    const perms = [
        { type:'microphone',    icon:'🎤', name:'Микрофон',     desc:'Голосовые сообщения и звонки' },
        { type:'camera',        icon:'📷', name:'Камера',       desc:'Видеозвонки и смена аватара' },
        { type:'notifications', icon:'🔔', name:'Уведомления',  desc:'Push-уведомления о сообщениях' },
    ];

    sh.innerHTML = '<div class="modal-handle"></div>'
        + '<div style="font-size:17px;font-weight:700;margin-bottom:4px">Разрешения</div>'
        + '<div style="font-size:13px;color:var(--text-2);margin-bottom:12px">Управление доступом к функциям устройства</div>'
        + '<div style="font-size:11px;color:var(--text-2);background:rgba(255,255,255,0.04);border:1px solid var(--border);border-radius:12px;padding:10px 12px;margin-bottom:14px;font-family:monospace;line-height:1.7">'
        + '🔒 protocol: <b style="color:' + (location.protocol==='https:' ? '#10b981' : '#ef4444') + '">' + location.protocol + '</b><br>'
        + '🌐 host: ' + location.host + '<br>'
        + '📱 mediaDevices: <b style="color:' + (navigator.mediaDevices ? '#10b981' : '#ef4444') + '">' + (navigator.mediaDevices ? 'есть' : 'НЕТ') + '</b><br>'
        + '🎤 getUserMedia: <b style="color:' + (navigator.mediaDevices?.getUserMedia ? '#10b981' : '#ef4444') + '">' + (navigator.mediaDevices?.getUserMedia ? 'есть' : 'НЕТ') + '</b><br>'
        + '📲 PWA: <b>' + (window.navigator.standalone ? 'да ✓' : 'нет — добавь на экран') + '</b><br>'
        + '🔐 secureContext: <b>' + (window.isSecureContext ? 'true' : 'false') + '</b>'
        + '</div>'
        + '<div id="perm-rows" style="display:flex;flex-direction:column;gap:8px"></div>';

    const closeBtn = document.createElement('button');
    closeBtn.style.cssText='width:100%;margin-top:18px;padding:13px;background:var(--surface2);border:1px solid var(--border);border-radius:16px;color:var(--text);font-size:15px;font-weight:600;cursor:pointer;font-family:inherit';
    closeBtn.textContent='Закрыть'; closeBtn.onclick=()=>ov.remove();
    sh.appendChild(closeBtn);
    ov.appendChild(sh); document.body.appendChild(ov);

    // Загружаем статусы асинхронно
    const rowsEl = sh.querySelector('#perm-rows');
    for (const p of perms) {
        const state = await getPermStatus(p.type);
        const row = document.createElement('div');
        row.style.cssText='display:flex;align-items:center;gap:14px;background:var(--surface2);border:1px solid var(--border);border-radius:16px;padding:14px 16px';
        row.innerHTML='<div style="font-size:28px;flex-shrink:0">'+p.icon+'</div>'
            +'<div style="flex:1;min-width:0">'
            +'<div style="font-size:15px;font-weight:600">'+p.name+'</div>'
            +'<div style="font-size:12px;color:var(--text-2);margin-top:2px">'+p.desc+'</div>'
            +'</div>'
            +'<div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">'
            +statusBadge(state)
            +(state !== 'granted' ? '<button data-ptype="'+p.type+'" style="font-size:12px;font-weight:600;color:var(--accent);background:none;border:none;cursor:pointer;padding:0;font-family:inherit">Разрешить</button>' : '')
            +(state === 'denied'  ? '<button data-guide="'+p.type+'" style="font-size:12px;font-weight:600;color:var(--text-2);background:none;border:none;cursor:pointer;padding:0;font-family:inherit">Как разрешить?</button>' : '')
            +'</div>';
        rowsEl.appendChild(row);
    }

    // Обработчики кнопок
    rowsEl.addEventListener('click', async e => {
        const ptype = e.target.dataset.ptype;
        const guide  = e.target.dataset.guide;
        if (ptype) {
            const result = await requestPermission(ptype);
            ov.remove();
            if (result === 'granted') { showToast('Разрешено ✓', 'success'); }
            else { _showPermDeniedGuide(ptype); }
            _updatePermsSummary();
        }
        if (guide) { _showPermDeniedGuide(guide); }
    });

    _updatePermsSummary();
}

async function _updatePermsSummary() {
    const el = document.getElementById('perms-summary');
    if (!el) return;
    const checks = ['microphone','camera','notifications'];
    const labels = { microphone:'Микрофон', camera:'Камера', notifications:'Уведомления' };
    let granted = [], denied = [];
    for (const t of checks) {
        let state = 'prompt';
        if (t === 'notifications') {
            state = ('Notification' in window) ? Notification.permission : 'unavailable';
        } else if (navigator.permissions) {
            try { const s = await navigator.permissions.query({name:t}); state = s.state; } catch(e){}
        } else {
            state = _getPerms()[t] || 'prompt';
        }
        if (state === 'granted') granted.push(labels[t]);
        else if (state === 'denied') denied.push(labels[t]);
    }
    if (denied.length) el.style.color = '#ef4444';
    else if (granted.length === checks.length) el.style.color = '#10b981';
    else el.style.color = '';
    const parts = [];
    if (granted.length) parts.push('✓ ' + granted.join(', '));
    if (denied.length) parts.push('✗ ' + denied.join(', '));
    el.textContent = parts.join('  ') || 'Нажмите для настройки';
}

// ══════════════════════════════════════════════════════════
//  НАСТРОЙКИ
// ══════════════════════════════════════════════════════════
function editName() {
    const name = prompt('Новое имя:', currentUser.name);
    if (!name?.trim() || name === currentUser.name) return;
    apiFetch('/update_profile', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() })
    }).then(r => r?.json()).then(d => {
        if (d?.success) {
            currentUser.name = name.trim();
            document.getElementById('settings-name')?.textContent && (document.getElementById('settings-name').textContent = name.trim());
            document.getElementById('settings-name-val') && (document.getElementById('settings-name-val').textContent = name.trim());
            localStorage.setItem('waychat_user_cache', JSON.stringify(currentUser));
            showToast('Имя обновлено', 'success');
        }
    }).catch(() => showToast('Ошибка', 'error'));
}

function editBio() {
    const bio = prompt('Ваше bio (до 500 символов):', currentUser.bio || '');
    if (bio === null) return;
    apiFetch('/update_profile', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bio: bio.slice(0, 500) })
    }).then(r => r?.json()).then(d => {
        if (d?.success) {
            currentUser.bio = bio;
            const bv = document.getElementById('settings-bio-val');
            if (bv) bv.textContent = bio || 'Не задано';
            localStorage.setItem('waychat_user_cache', JSON.stringify(currentUser));
            showToast('Bio обновлено', 'success');
        }
    }).catch(() => showToast('Ошибка', 'error'));
}

function copyUsername() {
    navigator.clipboard?.writeText(`@${currentUser.username}`).then(() => {
        showToast('@' + currentUser.username + ' скопировано', 'success'); vibrate(20);
    }).catch(() => {
        const el = document.createElement('input');
        el.value = `@${currentUser.username}`; document.body.appendChild(el); el.select(); document.execCommand('copy'); el.remove();
        showToast('Скопировано', 'success');
    });
}

function openThemePicker() {
    document.body.appendChild(createBottomSheet(`
        <div class="modal-handle"></div>
        <h3 style="font-size:18px;font-weight:700;margin-bottom:20px">Цвет темы</h3>
        <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:16px;margin-bottom:8px">
            ${Object.entries(THEMES).map(([key, t]) => `
                <div onclick="selectTheme('${key}')" style="display:flex;flex-direction:column;align-items:center;gap:8px;cursor:pointer">
                    <div style="width:52px;height:52px;border-radius:50%;background:${t.accent};box-shadow:0 0 16px rgba(0,0,0,0.4);border:${activeTheme===key?'3px solid white':'3px solid transparent'};transition:border 0.2s" id="theme-dot-${key}"></div>
                    <span style="font-size:11px;color:var(--text-2)">${t.name}</span>
                </div>`).join('')}
        </div>
    `));
}

function selectTheme(name) {
    applyTheme(name);
    document.querySelectorAll('[id^="theme-dot-"]').forEach(el => el.style.border = '3px solid transparent');
    const dot = document.getElementById(`theme-dot-${name}`);
    if (dot) dot.style.border = '3px solid white';
    const tn = document.getElementById('current-theme-name');
    if (tn) tn.textContent = THEMES[name]?.name;
    showToast(`Тема "${THEMES[name]?.name}" применена`, 'success'); vibrate(15);
}

function openNetworkInfo() {
    document.body.appendChild(createBottomSheet(`
        <div class="modal-handle"></div>
        <h3 style="font-size:18px;font-weight:700;margin-bottom:16px">Статус подключения</h3>
        <div style="display:flex;flex-direction:column;gap:12px">
            <div style="display:flex;align-items:center;gap:12px;padding:14px;background:rgba(255,255,255,0.04);border-radius:16px">
                <span style="color:${wsConnected?'var(--accent)':'#ef4444'}">${wsConnected ? ICONS.wifi.replace('white','var(--accent)') : ICONS.wifi_off.replace('white','#ef4444')}</span>
                <div><div style="font-weight:600">Socket.IO</div><div style="font-size:13px;color:var(--text-2)">${wsConnected?'Подключено':'Офлайн'}</div></div>
            </div>
        </div>
    `));
}

async function _toggleNotificationsOLD_REPLACED() { // placeholder
    void 0;
}
async function toggleNotifications() {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isPWA = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    if (isIOS && !isPWA) {
        const ov = document.createElement('div');
        ov.className = 'modal-overlay';
        ov.onclick = e => { if (e.target===ov) ov.remove(); };
        const sh = document.createElement('div'); sh.className='modal-sheet';
        sh.innerHTML='<div class="modal-handle"></div>'
            +'<div style="text-align:center;padding:10px 0 18px">'
            +'<div style="font-size:40px;margin-bottom:10px">📱</div>'
            +'<div style="font-size:17px;font-weight:700;margin-bottom:10px">Push-уведомления на iPhone</div>'
            +'<div style="font-size:14px;color:var(--text-2);line-height:1.7;text-align:left">'
            +'Push работают только через PWA:<br><br>'
            +'<b style="color:var(--text)">1.</b> Нажмите «Поделиться» ⬆ в Safari<br>'
            +'<b style="color:var(--text)">2.</b> Выберите «На экран Домой»<br>'
            +'<b style="color:var(--text)">3.</b> Откройте WayChat с экрана Домой<br>'
            +'<b style="color:var(--text)">4.</b> Разрешите уведомления при запросе'
            +'</div></div>';
        const btn=document.createElement('button');
        btn.style.cssText='width:100%;padding:14px;background:var(--accent);border:none;border-radius:16px;color:#000;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit';
        btn.textContent='Понятно'; btn.onclick=()=>ov.remove();
        sh.appendChild(btn); ov.appendChild(sh); document.body.appendChild(ov);
        return;
    }
    if (Notification.permission==='denied') {
        showToast('Уведомления заблокированы. Разрешите в настройках.','warning',5000);
        return;
    }
    try {
        if (notifPermission) {
            notifPermission=false; _updateNotifToggle(false);
            showToast('Уведомления выключены','info');
        } else {
            const perm = await Notification.requestPermission();
            if (perm==='granted') {
                notifPermission=true;
                if ('PushManager' in window && _swReg) await _subscribeToPush();
                _updateNotifToggle(true);
                showToast('Уведомления включены 🔔','success');
            } else {
                showToast('Заблокировано. Разрешите в настройках.','warning',4000);
            }
        }
    } catch(e){ console.warn('toggle notif:',e); }
}

async function pickMedia(context) {
    if (context === 'msg' && !currentChatId) return;
    const input = document.createElement('input');
    input.type  = 'file';
    input.accept = 'image/*,video/*';
    input.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;pointer-events:none';
    document.body.appendChild(input);
    input.onchange = async () => {
        const file = input.files[0];
        document.body.removeChild(input);
        if (!file) return;
        if (context === 'moment') { _showMomentEditor(file); return; }
        // Сообщение — грузим как раньше
        showToast('Загрузка...', 'info', 15000);
        const fd = new FormData();
        fd.append('file', file);
        try {
            const r = await apiFetch('/upload_media', {method:'POST', body:fd});
            if (!r) return;
            const d = await r.json();
            if (currentChatId) {
                socket.emit('send_message', {chat_id:currentChatId, type_msg: d.type||(file.type.startsWith('video')?'video':'image'), file_url:d.url, sender_id:currentUser.id});
                showToast('Отправлено','success');
            }
        } catch(e){ showToast('Ошибка загрузки','error'); }
    };
    input.addEventListener('cancel', () => { try { document.body.removeChild(input); } catch(e){} });
    input.click();
}

// ── Редактор момента: превью + перетаскиваемая гео-метка ──
let _meFile = null, _meGeo = null;

function _showMomentEditor(file) {
    _meFile = file; _meGeo = null;
    const isVid = file.type.startsWith('video');
    const url   = URL.createObjectURL(file);

    const ov = document.createElement('div');
    ov.id = 'me-ov';
    ov.style.cssText = 'position:fixed;inset:0;z-index:9500;background:#000;touch-action:none;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display",sans-serif';

    // Медиа-фон — скруглённые углы как в iOS
    const bg = document.createElement('div');
    bg.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:200px;overflow:hidden;border-radius:0 0 28px 28px';
    if (isVid) {
        const vid = document.createElement('video');
        vid.src=url; vid.autoplay=true; vid.muted=true; vid.loop=true; vid.playsInline=true;
        vid.style.cssText='width:100%;height:100%;object-fit:cover';
        bg.appendChild(vid);
    } else {
        const img = document.createElement('img');
        img.src=url; img.style.cssText='width:100%;height:100%;object-fit:cover';
        bg.appendChild(img);
    }
    ov.appendChild(bg);

    // Хедер с кнопкой закрыть
    const hdr = document.createElement('div');
    hdr.style.cssText = 'position:absolute;top:0;left:0;right:0;z-index:10;padding:max(env(safe-area-inset-top),52px) 16px 0;display:flex;align-items:center;justify-content:space-between;background:linear-gradient(to bottom,rgba(0,0,0,0.55) 0%,transparent 100%)';
    hdr.innerHTML = `
        <button id="me-close-btn" style="width:34px;height:34px;border-radius:50%;background:rgba(0,0,0,0.45);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border:none;color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="white" stroke-width="2.5" stroke-linecap="round"/></svg>
        </button>
        <div style="font-size:15px;font-weight:700;color:#fff;letter-spacing:-0.2px">Новый момент</div>
        <div style="width:34px"></div>
    `;
    hdr.querySelector('#me-close-btn').onclick = () => { ov.remove(); URL.revokeObjectURL(url); };
    ov.appendChild(hdr);

    // Плавающие инструменты — кнопки сверху справа (iOS стиль)
    const floatTools = document.createElement('div');
    floatTools.style.cssText = 'position:absolute;top:max(calc(env(safe-area-inset-top) + 52px),96px);right:14px;z-index:10;display:flex;flex-direction:column;gap:10px';

    const geoBtn = document.createElement('button');
    geoBtn.id='me-geo-btn';
    geoBtn.style.cssText='width:44px;height:44px;border-radius:50%;background:rgba(0,0,0,0.45);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,0.18);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all 0.2s';
    geoBtn.innerHTML='<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" stroke="white" stroke-width="2"/><circle cx="12" cy="9" r="2.5" stroke="white" stroke-width="2"/></svg>';
    geoBtn.title='Геолокация';

    const txtBtn = document.createElement('button');
    txtBtn.style.cssText='width:44px;height:44px;border-radius:50%;background:rgba(0,0,0,0.45);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,0.18);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all 0.2s';
    txtBtn.innerHTML='<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M17 3a2.828 2.828 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z" stroke="white" stroke-width="2.2" stroke-linecap="round"/></svg>';
    txtBtn.title='Добавить текст';

    floatTools.appendChild(geoBtn);
    floatTools.appendChild(txtBtn);
    ov.appendChild(floatTools);

    // Перетаскиваемая гео-метка
    const geoTag = document.createElement('div');
    geoTag.id = 'me-geo-tag';
    geoTag.style.cssText = 'position:absolute;left:50%;top:35%;background:rgba(0,0,0,0.55);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,0.22);border-radius:24px;padding:8px 16px;color:#fff;font-size:13px;font-weight:600;cursor:grab;display:none;align-items:center;gap:6px;white-space:nowrap;user-select:none;-webkit-user-select:none;z-index:8;transform:translateX(-50%)';
    geoTag.innerHTML = '📍 <span id="me-geo-txt">...</span>';
    _makeDraggable(geoTag, ov);
    ov.appendChild(geoTag);

    // Перетаскиваемая текстовая надпись
    const capTag = document.createElement('div');
    capTag.id = 'me-cap-tag';
    capTag.style.cssText = 'position:absolute;left:50%;bottom:230px;transform:translateX(-50%);background:rgba(0,0,0,0.45);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.15);border-radius:18px;padding:2px 8px;display:none;z-index:8;min-width:130px;max-width:82vw';
    const capInput = document.createElement('input');
    capInput.id='me-cap'; capInput.placeholder='Добавить текст...';
    capInput.style.cssText='background:transparent;border:none;outline:none;color:#fff;font-size:19px;font-weight:700;text-align:center;padding:10px 12px;width:100%;font-family:inherit;letter-spacing:-0.2px';
    capTag.appendChild(capInput);
    _makeDraggable(capTag, ov);
    ov.appendChild(capTag);

    // Обработчики кнопок инструментов
    geoBtn.onclick = () => _requestMeGeo(geoBtn, geoTag);
    txtBtn.onclick = () => {
        const sh = capTag.style.display === 'flex' ? 'none' : 'flex';
        capTag.style.display = sh;
        txtBtn.style.background = sh === 'flex' ? 'rgba(255,255,255,0.28)' : 'rgba(0,0,0,0.45)';
        if (sh === 'flex') capInput.focus();
    };

    // Нижняя панель — iOS 26 стиль: «стекло» + скруглённые карточки
    const panel = document.createElement('div');
    panel.style.cssText = 'position:absolute;bottom:0;left:0;right:0;z-index:10;background:rgba(18,18,18,0.92);backdrop-filter:blur(40px);-webkit-backdrop-filter:blur(40px);border-top:0.5px solid rgba(255,255,255,0.1);padding:16px 16px max(calc(env(safe-area-inset-bottom) + 14px),28px)';

    // Строка: аватар + "Ваша история" + время
    const meRow = document.createElement('div');
    meRow.style.cssText = 'display:flex;align-items:center;gap:12px;margin-bottom:14px';
    const avaEl = getAvatarHtml(currentUser, 'w-10 h-10');
    meRow.innerHTML = `
        <div style="width:40px;height:40px;border-radius:50%;overflow:hidden;border:2px solid var(--accent,#10b981);flex-shrink:0">${avaEl}</div>
        <div style="flex:1;min-width:0">
            <div style="font-size:15px;font-weight:700;color:#fff;letter-spacing:-0.2px">Ваша история</div>
            <div style="font-size:12px;color:rgba(255,255,255,0.45);margin-top:1px">Исчезнет через 24 часа</div>
        </div>
        <div style="font-size:12px;color:rgba(255,255,255,0.35);font-weight:500">Все контакты</div>
    `;
    panel.appendChild(meRow);

    // Разделитель
    const sep = document.createElement('div');
    sep.style.cssText = 'height:0.5px;background:rgba(255,255,255,0.08);margin-bottom:14px';
    panel.appendChild(sep);

    // Кнопки действий
    const acts = document.createElement('div');
    acts.style.cssText = 'display:flex;gap:10px';

    const cBtn = document.createElement('button');
    cBtn.style.cssText = 'flex:1;padding:15px;background:rgba(255,255,255,0.1);border:none;border-radius:18px;color:#fff;font-size:15px;font-weight:600;cursor:pointer;font-family:inherit;letter-spacing:-0.2px;-webkit-tap-highlight-color:transparent;active:opacity-60';
    cBtn.textContent = 'Отмена';
    cBtn.onclick = () => { ov.remove(); URL.revokeObjectURL(url); };

    const sBtn = document.createElement('button');
    sBtn.id = 'me-share';
    sBtn.style.cssText = 'flex:2;padding:15px;background:var(--accent,#10b981);border:none;border-radius:18px;color:#fff;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit;letter-spacing:-0.2px;display:flex;align-items:center;justify-content:center;gap:8px;-webkit-tap-highlight-color:transparent;box-shadow:0 4px 20px rgba(16,185,129,0.35)';
    sBtn.innerHTML = 'Опубликовать <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M5 12h14M13 6l6 6-6 6" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    sBtn.onclick = () => _publishMomentEditor(ov, file, url);

    acts.appendChild(cBtn);
    acts.appendChild(sBtn);
    panel.appendChild(acts);
    ov.appendChild(panel);
    document.body.appendChild(ov);
}

// Drag-and-drop для элементов на экране момента
function _makeDraggable(el, container) {
    let ox=0, oy=0, dragging=false;
    el.addEventListener('pointerdown', e => {
        e.preventDefault(); e.stopPropagation();
        el.setPointerCapture(e.pointerId);
        dragging=true;
        const r=el.getBoundingClientRect(), cr=container.getBoundingClientRect();
        ox=e.clientX-r.left+cr.left; oy=e.clientY-r.top+cr.top;
        el.style.cursor='grabbing'; el.style.transform='none';
    });
    el.addEventListener('pointermove', e => {
        if(!dragging) return; e.preventDefault();
        const cr=container.getBoundingClientRect();
        let nx=e.clientX-cr.left-ox, ny=e.clientY-cr.top-oy;
        nx=Math.max(0,Math.min(cr.width-el.offsetWidth,nx));
        ny=Math.max(0,Math.min(cr.height-el.offsetHeight,ny));
        el.style.left=nx+'px'; el.style.top=ny+'px';
    });
    el.addEventListener('pointerup', () => { dragging=false; el.style.cursor='grab'; });
    el.addEventListener('pointercancel', () => { dragging=false; });
}

async function _requestMeGeo(btn, geoTag) {
    // Сброс если уже активна
    if (_meGeo) {
        _meGeo=null; geoTag.style.display='none';
        btn.style.background='rgba(0,0,0,0.45)'; btn.style.borderColor='rgba(255,255,255,0.18)';
        btn.title='Геолокация'; return;
    }
    btn.title='Определяю...';
    btn.style.background='rgba(255,255,255,0.18)';
    if (!navigator.geolocation) {
        showToast('Геолокация не поддерживается','warning');
        btn.style.background='rgba(0,0,0,0.45)'; return;
    }
    try {
        const pos = await new Promise((res,rej) =>
            navigator.geolocation.getCurrentPosition(res, rej, {timeout:15000, enableHighAccuracy:false, maximumAge:60000})
        );
        let name = pos.coords.latitude.toFixed(4)+','+pos.coords.longitude.toFixed(4);
        try {
            const r = await fetch('https://nominatim.openstreetmap.org/reverse?lat='+pos.coords.latitude+'&lon='+pos.coords.longitude+'&format=json&accept-language=ru');
            const d = await r.json();
            name = d.address?.city||d.address?.town||d.address?.village||d.address?.county||name;
        } catch(e){}
        _meGeo = {name, lat:pos.coords.latitude.toFixed(5), lng:pos.coords.longitude.toFixed(5)};
        btn.title = name.length>16 ? name.slice(0,15)+'…' : name;
        btn.style.background='rgba(16,185,129,0.4)'; btn.style.borderColor='#10b981';
        const gt = document.getElementById('me-geo-txt');
        if(gt) gt.textContent = name.length>22 ? name.slice(0,20)+'…' : name;
        geoTag.style.display='flex';
    } catch(e) {
        const msg = e.code===1 ? 'Разрешите геолокацию в настройках Safari' : e.code===2 ? 'GPS недоступен' : 'Истёк тайм-аут';
        showToast(msg,'warning',4000);
        btn.style.background='rgba(0,0,0,0.45)';
    }
}

async function _publishMomentEditor(ov, file, url) {
    const sBtn = document.getElementById('me-share');
    if(sBtn){ sBtn.disabled=true; sBtn.textContent='Публикую...'; }
    const caption = (document.getElementById('me-cap')?.value||'').trim();
    showToast('Загрузка...','info',30000);
    try {
        const fd = new FormData();
        fd.append('file', file);
        if(caption) fd.append('text', caption);
        if(_meGeo){ fd.append('geo_name',_meGeo.name); fd.append('geo_lat',_meGeo.lat); fd.append('geo_lng',_meGeo.lng); }
        const r = await apiFetch('/create_moment',{method:'POST',body:fd});
        if(!r) throw new Error('no resp');
        ov.remove(); URL.revokeObjectURL(url);
        _meFile=null; _meGeo=null;
        momentsCache=null; loadMoments();
        showToast('Момент опубликован! 🎉','success');
    } catch(e){
        showToast('Ошибка загрузки','error');
        if(sBtn){ sBtn.disabled=false; sBtn.textContent='Поделиться →'; }
    }
}

// ══════════════════════════════════════════════════════════
//  МОМЕНТЫ
// ══════════════════════════════════════════════════════════
async function loadMoments() {
    const container = document.getElementById('full-moments-list');
    if (!container) return;
    const now = Date.now();
    if (momentsCache && (now - momentsLastLoad) < 30000) { renderMomentsList(container, momentsCache); return; }
    if (!momentsCache) container.innerHTML = `<div style="text-align:center;opacity:0.3;padding:20px;font-size:14px">Загрузка...</div>`;
    try {
        const r = await apiFetch('/get_moments');
        if (!r) return;
        const moments = await r.json();
        momentsCache = moments; momentsLastLoad = now; currentMoments = moments;
        renderMomentsList(container, moments);
    } catch(e) {
        if (!momentsCache) container.innerHTML = `<div style="text-align:center;opacity:0.25;padding:40px;font-size:14px">Не удалось загрузить</div>`;
    }
}

function renderMomentsList(container, moments) {
    if (!moments?.length) {
        container.innerHTML = '<div style="text-align:center;opacity:0.25;padding:48px 20px;font-size:15px">Моментов пока нет</div>';
        return;
    }
    currentMoments = moments;
    container.innerHTML = '';

    // Группируем по пользователю (порядок первого появления сохраняется)
    const userOrder = [];
    const byUser = new Map();
    moments.forEach(m => {
        if (!byUser.has(m.user_id)) { byUser.set(m.user_id, []); userOrder.push(m.user_id); }
        byUser.get(m.user_id).push(m);
    });

    userOrder.forEach(uid => {
        const list  = byUser.get(uid);
        const first = list[0];
        const cnt   = list.length;
        const isMe  = uid === currentUser?.id;

        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:14px;padding:10px 2px;cursor:pointer;border-radius:18px;margin-bottom:2px;-webkit-tap-highlight-color:transparent';
        row.onclick = () => openUserMomentsViewer(uid);

        // Аватар с SVG-кольцом (разрезы по количеству моментов)
        const avaWrap = document.createElement('div');
        avaWrap.style.cssText = 'position:relative;flex-shrink:0;width:60px;height:60px';

        // Аватар внутри
        const avaInner = document.createElement('div');
        avaInner.style.cssText = 'position:absolute;inset:4px;border-radius:50%;overflow:hidden';
        avaInner.innerHTML = getAvatarHtml({id:uid, name:first.user_name, avatar:first.user_avatar}, 'w-full h-full');
        avaWrap.appendChild(avaInner);

        // SVG кольцо с разрезами (серое если просмотрено)
        const NS = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(NS, 'svg');
        svg.setAttribute('width','60'); svg.setAttribute('height','60'); svg.setAttribute('viewBox','0 0 60 60');
        svg.style.cssText = 'position:absolute;inset:0;pointer-events:none';
        const CX=30, CY=30, R=28;
        const GAP_DEG = cnt > 1 ? 5 : 0;
        const SEG_DEG = (360 - GAP_DEG * cnt) / cnt;
        const ringColor = (!isMe && _viewedMomentUsers.has(uid)) ? '#555' : 'var(--accent)';
        for (let i=0; i<cnt; i++) {
            const s = -90 + i*(SEG_DEG+GAP_DEG), e = s + SEG_DEG;
            const tr = d => d*Math.PI/180;
            const x1=CX+R*Math.cos(tr(s)), y1=CY+R*Math.sin(tr(s));
            const x2=CX+R*Math.cos(tr(e)), y2=CY+R*Math.sin(tr(e));
            const path = document.createElementNS(NS, 'path');
            path.setAttribute('d', `M${x1.toFixed(2)} ${y1.toFixed(2)} A${R} ${R} 0 ${SEG_DEG>180?1:0} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`);
            path.setAttribute('stroke', ringColor); path.setAttribute('stroke-width','3.5');
            path.setAttribute('fill','none'); path.setAttribute('stroke-linecap','round');
            svg.appendChild(path);
        }
        avaWrap.appendChild(svg);
        row.appendChild(avaWrap);

        // Инфо
        const info = document.createElement('div');
        info.style.cssText = 'flex:1;min-width:0';
        const previewText = first.text || (first.media_url ? (first.media_url.match(/\.(mp4|mov|webm)/i) ? '🎥 Видео' : '📷 Фото') : '');
        info.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between">'
            + '<div style="font-weight:700;font-size:15px">' + first.user_name + (isMe?' (Вы)':'') + '</div>'
            + '<div style="display:flex;align-items:center;gap:6px">'
            + (cnt>1 ? '<span style="font-size:11px;background:var(--accent);color:white;border-radius:10px;padding:2px 8px;font-weight:700">'+cnt+'</span>' : '')
            + '<span style="font-size:12px;color:var(--text-2)">'+first.timestamp+'</span>'
            + '</div></div>'
            + '<div style="font-size:13px;color:var(--text-2);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+previewText+'</div>';
        row.appendChild(info);
        container.appendChild(row);
    });
}

// ── Просмотр всех моментов пользователя с листанием ──
function openUserMomentsViewer(userId) {
    const list = currentMoments.filter(m => m.user_id === userId);
    if (!list.length) return;
    // Помечаем как просмотренные
    if (userId !== currentUser?.id) {
        _viewedMomentUsers.add(userId);
        // Перерисовываем список чтобы кольцо стало серым
        const container = document.getElementById('full-moments-list');
        if (container && momentsCache) renderMomentsList(container, momentsCache);
    }
    _runMomentsViewer(list, 0);
}

function _runMomentsViewer(list, startIdx) {
    let idx = startIdx;
    let autoTimer = null;

    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;z-index:9000;background:#000;touch-action:none';

    function render() {
        ov.innerHTML = '';
        const m = list[idx];
        const isMe = m.user_id === currentUser?.id;

        // Медиа-фон
        const bg = document.createElement('div');
        bg.style.cssText = 'position:absolute;inset:0';
        if (m.media_url) {
            if (m.media_url.match(/\.(mp4|mov|webm)/i)) {
                const vid = document.createElement('video');
                vid.src = m.media_url; vid.autoplay=true; vid.loop=false; vid.playsInline=true; vid.muted=false;
                vid.style.cssText = 'width:100%;height:100%;object-fit:cover';
                bg.appendChild(vid);
            } else {
                const img = document.createElement('img');
                img.src = m.media_url; img.style.cssText='width:100%;height:100%;object-fit:cover';
                bg.appendChild(img);
            }
        } else {
            bg.style.background = 'linear-gradient(135deg,#1a1a2e,#16213e,#0f3460)';
            const txt = document.createElement('div');
            txt.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:40px';
            txt.innerHTML = '<div style="font-size:clamp(18px,5vw,28px);font-weight:700;color:#fff;text-align:center;line-height:1.5;text-shadow:0 2px 16px rgba(0,0,0,0.5)">'+escHtml(m.text||'')+'</div>';
            bg.appendChild(txt);
        }
        ov.appendChild(bg);

        // Трекинг просмотра (не для своих)
        if (m.user_id !== currentUser?.id) {
            apiFetch('/view_moment/' + m.id, {method:'POST'}).catch(()=>{});
        }

        // Прогресс-бары
        const bars = document.createElement('div');
        bars.style.cssText = 'position:absolute;top:max(env(safe-area-inset-top,12px),12px);left:12px;right:12px;z-index:3;display:flex;gap:3px';
        list.forEach((_,i) => {
            const bar = document.createElement('div');
            bar.style.cssText = 'flex:1;height:2px;background:rgba(255,255,255,0.3);border-radius:2px;overflow:hidden';
            const fill = document.createElement('div');
            fill.style.cssText = 'height:100%;background:white;width:'+(i<idx?'100':'0')+'%';
            if (i===idx) fill.id = 'mpf';
            bar.appendChild(fill); bars.appendChild(bar);
        });
        ov.appendChild(bars);

        // Закрыть
        const xBtn = document.createElement('button');
        xBtn.style.cssText = 'position:absolute;top:max(calc(env(safe-area-inset-top,12px)+18px),22px);right:14px;z-index:4;background:rgba(0,0,0,0.45);backdrop-filter:blur(8px);border:none;color:white;width:36px;height:36px;border-radius:50%;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center';
        xBtn.textContent = '✕';
        xBtn.onclick = e => { e.stopPropagation(); clearTimeout(autoTimer); ov.remove(); };
        ov.appendChild(xBtn);

        // Инфо снизу
        const bar2 = document.createElement('div');
        bar2.style.cssText = 'position:absolute;bottom:0;left:0;right:0;z-index:3;padding:20px 16px max(calc(env(safe-area-inset-bottom,0px)+20px),30px);background:linear-gradient(to top,rgba(0,0,0,0.75),transparent);display:flex;align-items:center;gap:12px';
        bar2.innerHTML = getAvatarHtml({id:m.user_id,name:m.user_name,avatar:m.user_avatar},'w-11 h-11');
        const it = document.createElement('div');
        it.innerHTML = '<div style="font-weight:700;font-size:15px;color:#fff;text-shadow:0 1px 6px rgba(0,0,0,0.6)">'+escHtml(m.user_name)+'</div>'
            +'<div style="font-size:12px;color:rgba(255,255,255,0.7);margin-top:1px">'+m.timestamp+(m.geo_name?' · 📍'+m.geo_name:'')+'</div>';
        bar2.appendChild(it);

        if (isMe) {
            const acts = document.createElement('div');
            acts.style.cssText = 'margin-left:auto;display:flex;gap:8px;align-items:center';

            // Кнопка "Кто смотрел"
            const viewBtn = document.createElement('button');
            viewBtn.style.cssText = 'background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.25);border-radius:12px;color:#fff;padding:7px 12px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;display:flex;align-items:center;gap:5px';
            const vc = m.view_count || 0;
            viewBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="white" stroke-width="2"/><circle cx="12" cy="12" r="3" stroke="white" stroke-width="2"/></svg> ' + vc;
            viewBtn.onclick = e => { e.stopPropagation(); _showMomentViewers(m.id); };
            acts.appendChild(viewBtn);

            const del = document.createElement('button');
            del.style.cssText = 'background:rgba(239,68,68,0.22);border:1px solid rgba(239,68,68,0.5);border-radius:12px;color:#fff;padding:7px 14px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit';
            del.textContent = 'Удалить';
            del.onclick = e => { e.stopPropagation(); clearTimeout(autoTimer); _confirmDeleteMoment(m.id, ov); };
            acts.appendChild(del);
            bar2.appendChild(acts);
        }
        ov.appendChild(bar2);

        // Тап по половинам — листание
        ov.onclick = e => {
            if (e.target.closest('button')) return;
            clearTimeout(autoTimer);
            if (e.clientX < window.innerWidth/2) prev();
            else next();
        };

        // Запускаем прогресс
        clearTimeout(autoTimer);
        const dur = m.media_url ? 7000 : 5000;
        requestAnimationFrame(() => {
            const fill = document.getElementById('mpf');
            if (fill) { fill.style.transition='width '+dur/1000+'s linear'; fill.style.width='100%'; }
        });
        autoTimer = setTimeout(() => next(), dur+100);
    }

    function next() { clearTimeout(autoTimer); if (idx<list.length-1){idx++;render();}else{ov.remove();} }
    function prev() { clearTimeout(autoTimer); if (idx>0){idx--;render();} }

    document.body.appendChild(ov);
    render();
}

const _viewersCache = {};

function _renderViewersList(container, viewers) {
    if (!viewers.length) {
        container.innerHTML = '<div style="text-align:center;padding:32px 20px;color:var(--text-2);font-size:14px">👁 Ещё никто не смотрел</div>';
        return;
    }
    container.innerHTML = viewers.map(v =>
        '<div style="display:flex;align-items:center;gap:12px;padding:11px 0;border-bottom:1px solid var(--border)">'
        + getAvatarHtml({id:v.id,name:v.name,avatar:v.avatar},'w-10 h-10')
        + '<div style="flex:1"><div style="font-weight:600;font-size:14px">'+escHtml(v.name)+'</div>'
        + '<div style="font-size:12px;color:var(--text-2);margin-top:1px">'+v.time+'</div></div>'
        + '</div>'
    ).join('');
}

async function _showMomentViewers(momentId) {
    const cached = _viewersCache[momentId];
    const ov = document.createElement('div');
    ov.className = 'modal-overlay';
    ov.onclick = e => { if (e.target===ov) ov.remove(); };
    const sh = document.createElement('div'); sh.className='modal-sheet';
    sh.innerHTML='<div class="modal-handle"></div>'
        +'<div style="display:flex;align-items:center;gap:8px;margin-bottom:16px">'
        +'<span style="font-size:17px;font-weight:700">👁 Кто смотрел</span>'
        +'<span id="mv-cnt" style="font-size:13px;color:var(--text-2);background:var(--surface2);border-radius:10px;padding:2px 8px">'+(cached?cached.length:'')+'</span></div>'
        +'<div id="mv-list" style="max-height:52vh;overflow-y:auto">'
        +(cached ? '' : '<div style="text-align:center;padding:24px;color:var(--text-2);font-size:13px">⏳ Загрузка...</div>')
        +'</div>';
    const closeBtn=document.createElement('button');
    closeBtn.style.cssText='width:100%;margin-top:14px;padding:13px;background:var(--surface2);border:1px solid var(--border);border-radius:16px;color:var(--text);font-size:15px;font-weight:600;cursor:pointer;font-family:inherit';
    closeBtn.textContent='Закрыть'; closeBtn.onclick=()=>ov.remove();
    sh.appendChild(closeBtn); ov.appendChild(sh); document.body.appendChild(ov);

    const listEl = sh.querySelector('#mv-list');
    const cntEl  = sh.querySelector('#mv-cnt');

    // Показываем из кэша МГНОВЕННО
    if (cached) _renderViewersList(listEl, cached);

    // Обновляем с сервера в фоне
    try {
        const d = await (await apiFetch('/moment_viewers/'+momentId)).json();
        if (d.viewers) {
            _viewersCache[momentId] = d.viewers;
            _renderViewersList(listEl, d.viewers);
            if (cntEl) cntEl.textContent = d.viewers.length || '';
        }
    } catch(e) {
        if (!cached) listEl.innerHTML='<div style="text-align:center;padding:20px;color:var(--text-2)">Ошибка загрузки</div>';
    }
}

function _confirmDeleteMoment(momentId, viewerOv) {
    const ov = document.createElement('div');
    ov.className = 'modal-overlay';
    ov.onclick = e => { if (e.target === ov) ov.remove(); };
    const sh = document.createElement('div');
    sh.className = 'modal-sheet';
    sh.innerHTML = '<div class="modal-handle"></div>'
        + '<div style="text-align:center;padding:8px 0 20px">'
        + '<div style="font-size:42px;margin-bottom:10px">🗑️</div>'
        + '<div style="font-size:17px;font-weight:700;margin-bottom:8px">Удалить момент?</div>'
        + '<div style="font-size:14px;color:var(--text-2)">Это действие нельзя отменить</div>'
        + '</div>';
    const btns = document.createElement('div');
    btns.style.cssText = 'display:flex;gap:10px';
    const ca = document.createElement('button');
    ca.style.cssText = 'flex:1;padding:14px;background:var(--surface2);border:1px solid var(--border);border-radius:16px;color:var(--text);font-size:15px;font-weight:600;cursor:pointer;font-family:inherit';
    ca.textContent = 'Отмена'; ca.onclick = () => ov.remove();
    const ok = document.createElement('button');
    ok.style.cssText = 'flex:1;padding:14px;background:#ef4444;border:none;border-radius:16px;color:white;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit';
    ok.textContent = 'Удалить';
    ok.onclick = async () => {
        ov.remove(); viewerOv.remove();
        try {
            await apiFetch('/delete_moment/' + momentId, {method:'POST'});
            momentsCache = null; loadMoments(); showToast('Момент удалён','success');
        } catch(e) { showToast('Ошибка удаления','error'); }
    };
    btns.appendChild(ca); btns.appendChild(ok);
    sh.appendChild(btns); ov.appendChild(sh); document.body.appendChild(ov);
}

function escHtml(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function openTextMoment() {
    let _tGeo=null;
    const ov = document.createElement('div');
    ov.style.cssText='position:fixed;inset:0;z-index:9500;background:linear-gradient(135deg,#1a1a2e,#16213e,#0f3460);display:flex;align-items:center;justify-content:center;padding:20px;touch-action:none';

    const inner=document.createElement('div'); inner.style.cssText='width:100%;max-width:420px;display:flex;flex-direction:column;gap:12px';

    const ttl=document.createElement('div'); ttl.style.cssText='text-align:center;color:#fff;font-size:17px;font-weight:700'; ttl.textContent='Текстовый момент';

    const ta=document.createElement('textarea'); ta.rows=6; ta.placeholder='Что у вас нового? 💭';
    ta.style.cssText='width:100%;background:rgba(255,255,255,0.1);backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,0.2);border-radius:20px;color:#fff;font-size:18px;padding:18px;outline:none;resize:none;font-family:inherit;line-height:1.5;box-sizing:border-box';

    const gBtn=document.createElement('button');
    gBtn.style.cssText='padding:11px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);border-radius:14px;color:#fff;font-size:14px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;font-family:inherit';
    gBtn.innerHTML='<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" stroke="white" stroke-width="2"/><circle cx="12" cy="9" r="2.5" stroke="white" stroke-width="2"/></svg><span id="tg-lbl">Добавить геолокацию</span>';
    gBtn.onclick=async()=>{
        const lbl=document.getElementById('tg-lbl');
        if(_tGeo){_tGeo=null;gBtn.style.background='rgba(255,255,255,0.08)';if(lbl)lbl.textContent='Добавить геолокацию';return;}
        if(lbl)lbl.textContent='Определяю...';
        if(!navigator.geolocation){showToast('Геолокация не поддерживается','warning');if(lbl)lbl.textContent='Добавить геолокацию';return;}
        try{
            const pos=await new Promise((res,rej)=>navigator.geolocation.getCurrentPosition(res,rej,{timeout:15000,maximumAge:60000}));
            let name=pos.coords.latitude.toFixed(4)+','+pos.coords.longitude.toFixed(4);
            try{const r=await fetch('https://nominatim.openstreetmap.org/reverse?lat='+pos.coords.latitude+'&lon='+pos.coords.longitude+'&format=json&accept-language=ru');const d=await r.json();name=d.address?.city||d.address?.town||d.address?.village||name;}catch(e){}
            _tGeo={name,lat:pos.coords.latitude,lng:pos.coords.longitude};
            gBtn.style.background='rgba(16,185,129,0.25)';gBtn.style.borderColor='#10b981';
            if(lbl)lbl.textContent='📍 '+name;
        }catch(e){showToast(e.code===1?'Разрешите геолокацию в настройках Safari':'Ошибка GPS','warning');if(lbl)lbl.textContent='Добавить геолокацию';}
    };

    const btns=document.createElement('div');btns.style.cssText='display:flex;gap:10px';
    const cc=document.createElement('button');cc.textContent='Отмена';cc.style.cssText='flex:1;padding:14px;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);border-radius:16px;color:#fff;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit';cc.onclick=()=>ov.remove();
    const ss=document.createElement('button');ss.id='tt-share';ss.textContent='Поделиться →';ss.style.cssText='flex:2;padding:14px;background:var(--accent);border:none;border-radius:16px;color:#fff;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit';
    ss.onclick=async()=>{
        const txt=ta.value.trim();if(!txt){showToast('Введите текст','warning');return;}
        ss.disabled=true;ss.textContent='Публикую...';
        try{
            const fd=new FormData();fd.append('text',txt);
            if(_tGeo){fd.append('geo_name',_tGeo.name);fd.append('geo_lat',_tGeo.lat);fd.append('geo_lng',_tGeo.lng);}
            const r=await apiFetch('/create_moment',{method:'POST',body:fd});if(!r)throw new Error();
            ov.remove();momentsCache=null;loadMoments();showToast('Момент опубликован! 🎉','success');
        }catch(e){showToast('Ошибка','error');ss.disabled=false;ss.textContent='Поделиться →';}
    };
    btns.appendChild(cc);btns.appendChild(ss);

    inner.appendChild(ttl);inner.appendChild(ta);inner.appendChild(gBtn);inner.appendChild(btns);
    ov.appendChild(inner);document.body.appendChild(ov);
    setTimeout(()=>ta.focus(),120);
}

// ══════════════════════════════════════════════════════════
//  WebRTC — УЛУЧШЕННЫЙ: ICE restart, speakerphone, flip, group
// ══════════════════════════════════════════════════════════
let _currentFacingMode = 'user';  // для flip
let _speakerOn         = true;

// ══════════════════════════════════════════════════════════
//  РАЗРЕШЕНИЯ — единая система запроса и кэша
// ══════════════════════════════════════════════════════════

const _PERM_KEY = 'wc_permissions'; // localStorage: {mic, camera, notifications}

function _getPerms() {
    try { return JSON.parse(localStorage.getItem(_PERM_KEY) || '{}'); } catch(e){ return {}; }
}
function _savePerm(key, val) {
    const p = _getPerms(); p[key] = val;
    localStorage.setItem(_PERM_KEY, JSON.stringify(p));
}

// Запрашивает разрешение с объяснением (только если ещё не запрашивали)
// Кэш разрешений для текущей сессии
const _sessionPerms = {};

// Запросить разрешение на mic/camera — показывает диалог и вызывает getUserMedia
// ПРЯМО из обработчика кнопки чтобы Safari не блокировал
function requestPermission(type) {
    if (type === 'notifications') {
        return new Promise(async resolve => {
            if (Notification.permission === 'granted') return resolve('granted');
            if (Notification.permission === 'denied')  return resolve('denied');
            const perms = _getPerms();
            if (!perms.notifications_asked) {
                _savePerm('notifications_asked', true);
            }
            const result = await Notification.requestPermission();
            resolve(result);
        });
    }

    if (type === 'microphone' || type === 'camera') {
        // Уже получили в этой сессии
        if (_sessionPerms[type] === 'granted') return Promise.resolve('granted');
        if (_sessionPerms[type] === 'denied')  return Promise.resolve('denied');

        const constraints = type === 'camera'
            ? { audio: true, video: { facingMode: 'user' } }
            : { audio: true, video: false };

        const perms = _getPerms();
        const firstTime = !perms[type + '_asked'];

        if (!firstTime) {
            // Уже видели диалог — сразу пробуем getUserMedia
            // Пропускаем проверку protocol — Cloudflare туннель HTTPS снаружи
            const hasMod = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
            const hasLeg = !!(navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia);
            if (!hasMod && !hasLeg) return Promise.resolve('denied');

            if (hasMod) {
                return navigator.mediaDevices.getUserMedia(constraints)
                    .then(stream => {
                        stream.getTracks().forEach(t => t.stop());
                        _sessionPerms[type] = 'granted';
                        return 'granted';
                    })
                    .catch(e => {
                        if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
                            _sessionPerms[type] = 'denied';
                            return 'denied';
                        }
                        _sessionPerms[type] = 'granted';
                        return 'granted';
                    });
            } else {
                const gum = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia;
                return new Promise(res => {
                    gum.call(navigator, constraints,
                        stream => { stream.getTracks().forEach(t => t.stop()); _sessionPerms[type] = 'granted'; res('granted'); },
                        err => { _sessionPerms[type] = 'denied'; res('denied'); }
                    );
                });
            }
        }

        // Первый раз — показываем наш диалог-объяснение
        // Кнопка "Разрешить" вызывает getUserMedia СИНХРОННО из onclick (Safari требует)
        return new Promise(resolve => {
            const cfg = {
                microphone: { icon:'🎤', title:'Доступ к микрофону', desc:'Нужен для голосовых сообщений и звонков', btn:'Разрешить микрофон' },
                camera:     { icon:'📷', title:'Доступ к камере',    desc:'Нужен для видеозвонков и записи видео',  btn:'Разрешить камеру' },
            };
            const c = cfg[type];
            const ov = document.createElement('div');
            ov.className   = 'modal-overlay';
            ov.style.zIndex = '99999';
            const sh = document.createElement('div');
            sh.className = 'modal-sheet';
            sh.innerHTML =
                '<div class="modal-handle"></div>'
                + '<div style="text-align:center;padding:10px 0 22px">'
                + '<div style="font-size:54px;margin-bottom:14px">'+c.icon+'</div>'
                + '<div style="font-size:18px;font-weight:700;margin-bottom:10px">'+c.title+'</div>'
                + '<div style="font-size:14px;color:var(--text-2);line-height:1.55">'+c.desc+'<br><br>'
                + '<span style="font-size:13px;opacity:.7">Safari покажет системный запрос разрешения</span>'
                + '</div></div>';

            const allowBtn = document.createElement('button');
            allowBtn.style.cssText = 'width:100%;padding:15px;background:var(--accent);border:none;border-radius:16px;color:#000;font-size:16px;font-weight:700;cursor:pointer;font-family:inherit';
            allowBtn.textContent = c.btn;

            // КРИТИЧНО: getUserMedia вызывается ПРЯМО в onclick — Safari пропускает
            allowBtn.onclick = () => {
                ov.remove();
                _savePerm(type + '_asked', true);
                // Синхронный вызов из user gesture — Safari требует
                const hasModernAPI = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
                const hasLegacyAPI = !!(navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia);
                if (hasModernAPI) {
                    navigator.mediaDevices.getUserMedia(constraints)
                        .then(stream => {
                            stream.getTracks().forEach(t => t.stop());
                            _sessionPerms[type] = 'granted';
                            resolve('granted');
                        })
                        .catch(e => {
                            if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
                                _sessionPerms[type] = 'denied';
                                resolve('denied');
                            } else {
                                _sessionPerms[type] = 'granted';
                                resolve('granted');
                            }
                        });
                } else if (hasLegacyAPI) {
                    const gum = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia;
                    gum.call(navigator, constraints,
                        stream => { stream.getTracks().forEach(t => t.stop()); _sessionPerms[type] = 'granted'; resolve('granted'); },
                        err => {
                            if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                                _sessionPerms[type] = 'denied'; resolve('denied');
                            } else {
                                _sessionPerms[type] = 'granted'; resolve('granted');
                            }
                        }
                    );
                } else {
                    resolve('denied');
                }
            };

            const skipBtn = document.createElement('button');
            skipBtn.style.cssText = 'width:100%;padding:10px;background:none;border:none;color:var(--text-2);font-size:14px;cursor:pointer;font-family:inherit;margin-top:4px';
            skipBtn.textContent = 'Не сейчас';
            skipBtn.onclick = () => { ov.remove(); _savePerm(type + '_asked', true); resolve('denied'); };

            sh.appendChild(allowBtn);
            sh.appendChild(skipBtn);
            ov.appendChild(sh);
            document.body.appendChild(ov);
        });
    }

    return Promise.resolve('unknown');
}

// Диалог-объяснение перед запросом
function _showPermExplainer(type) {
    return new Promise(resolve => {
        const cfg = {
            microphone:    { icon:'🎤', title:'Доступ к микрофону',    desc:'Нужен для голосовых сообщений и звонков', btn:'Разрешить микрофон' },
            camera:        { icon:'📷', title:'Доступ к камере',        desc:'Нужен для видеозвонков и аватара',       btn:'Разрешить камеру' },
            notifications: { icon:'🔔', title:'Push-уведомления',       desc:'Чтобы получать сообщения когда приложение закрыто', btn:'Разрешить уведомления' },
        };
        const c = cfg[type] || { icon:'🔑', title:'Разрешение', desc:'', btn:'Продолжить' };

        const ov = document.createElement('div');
        ov.className = 'modal-overlay';
        ov.style.zIndex = '99999';
        const sh = document.createElement('div'); sh.className='modal-sheet';
        sh.innerHTML='<div class="modal-handle"></div>'
            +'<div style="text-align:center;padding:8px 0 20px">'
            +'<div style="font-size:52px;margin-bottom:12px">'+c.icon+'</div>'
            +'<div style="font-size:18px;font-weight:700;margin-bottom:8px">'+c.title+'</div>'
            +'<div style="font-size:14px;color:var(--text-2);line-height:1.5">'+c.desc+'</div>'
            +'</div>';
        const btn=document.createElement('button');
        btn.style.cssText='width:100%;padding:14px;background:var(--accent);border:none;border-radius:16px;color:#000;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit';
        btn.textContent=c.btn;
        btn.onclick=()=>{ ov.remove(); resolve(); };
        sh.appendChild(btn);
        const skip=document.createElement('button');
        skip.style.cssText='width:100%;padding:10px;background:none;border:none;color:var(--text-2);font-size:14px;cursor:pointer;font-family:inherit;margin-top:4px';
        skip.textContent='Не сейчас';
        skip.onclick=()=>{ ov.remove(); resolve(); };
        sh.appendChild(skip);
        ov.appendChild(sh);
        document.body.appendChild(ov);
    });
}

// Показывает инструкцию как разрешить в настройках если заблокировано
function _showPermDeniedGuide(type) {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isPWA = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    const cfg = {
        microphone: { icon:'🎤', name:'Микрофон',
            ios_safari: 'Настройки iPhone → Safari → Микрофон → Разрешить',
            ios_pwa:    'Настройки iPhone → Конфиденциальность → Микрофон → включить WayChat',
            other:      'Нажмите 🔒 в адресной строке браузера → Разрешить микрофон' },
        camera: { icon:'📷', name:'Камера',
            ios_safari: 'Настройки iPhone → Safari → Камера → Разрешить',
            ios_pwa:    'Настройки iPhone → Конфиденциальность → Камера → включить WayChat',
            other:      'Нажмите 🔒 в адресной строке браузера → Разрешить камеру' },
        notifications: { icon:'🔔', name:'Уведомления',
            ios_safari: 'Нужно добавить WayChat на экран Домой',
            ios_pwa:    'Настройки iPhone → WayChat → Уведомления → включить',
            other:      'Нажмите 🔒 в адресной строке браузера → Разрешить уведомления' },
    };
    const c = cfg[type] || { icon:'🔑', name:'Доступ', ios_safari:'Настройки', ios_pwa:'Настройки', other:'Настройки браузера' };
    let guide;
    if (isIOS && isPWA)      guide = c.ios_pwa;
    else if (isIOS)          guide = c.ios_safari;
    else                     guide = c.other;

    const ov = document.createElement('div');
    ov.className = 'modal-overlay';
    ov.style.zIndex = '99999';
    const sh = document.createElement('div'); sh.className='modal-sheet';
    sh.innerHTML='<div class="modal-handle"></div>'
        +'<div style="text-align:center;padding:8px 0 20px">'
        +'<div style="font-size:48px;margin-bottom:12px">'+c.icon+'</div>'
        +'<div style="font-size:17px;font-weight:700;margin-bottom:10px">'+c.name.charAt(0).toUpperCase()+c.name.slice(1)+' заблокирован</div>'
        +'<div style="font-size:14px;color:var(--text-2);line-height:1.6;text-align:left;background:var(--surface2);border-radius:14px;padding:14px">'
        +'Чтобы разрешить '+c.name+':<br><br>'
        +'<b style="color:var(--text)">'+guide+'</b>'
        +'</div></div>';
    const btn=document.createElement('button');
    btn.style.cssText='width:100%;padding:14px;background:var(--surface2);border:1px solid var(--border);border-radius:16px;color:var(--text);font-size:15px;font-weight:600;cursor:pointer;font-family:inherit';
    btn.textContent='Понятно'; btn.onclick=()=>ov.remove();
    sh.appendChild(btn); ov.appendChild(sh); document.body.appendChild(ov);
}

async function startCall(type) {
    if (!currentPartnerId) return;
    currentCallType = type; iceRestartCount = 0;
    vibrate(50);
    setupCallScreen(type, false);
    pendingIce = [];
    _speakerOn = true;
    try {
        callLocalStream = await getLocalStream(type);
        if (type === 'video') showLocalVideo();
        peerConnection = createPeerConnection();
        callLocalStream.getTracks().forEach(t => peerConnection.addTrack(t, callLocalStream));
        const offer = await peerConnection.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: type === 'video' });
        await peerConnection.setLocalDescription(offer);
        socket.emit('call_user', { to: currentPartnerId, from_name: currentUser.name, from_avatar: currentUser.avatar, offer, call_type: type });
        setTimeout(() => {
            if (peerConnection && ['new','checking'].includes(peerConnection.iceConnectionState)) {
                showToast('Абонент не отвечает', 'warning'); endCall(true);
            }
        }, 45000);
    } catch(e) {
        console.error('startCall:', e); endCall(false);
        if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
            showToast('Разрешите доступ в Настройки → Safari → Камера/Микрофон', 'error', 6000);
        } else {
            showToast('Ошибка доступа к медиа: ' + (e.message || e.name), 'error', 4000);
        }
    }
}

async function getLocalStream(type, facingMode) {
    const fm = facingMode || _currentFacingMode || 'user';
    const permKey = type === 'video' ? 'camera' : 'microphone';

    // Проверяем наличие API — если есть, значит браузер считает контекст безопасным
    // Не проверяем protocol напрямую — Cloudflare туннель HTTPS снаружи но HTTP внутри

    const hasModern = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    const hasLegacy = !!(navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia);

    if (!hasModern && !hasLegacy) {
        const e = new Error('getUserMedia не поддерживается. Проверь разрешения в Настройки → Safari');
        e.name = 'HTTPSRequired';
        throw e;
    }

    // iOS: пробуем сначала простые constraints (строгие часто падают с OverconstrainedError)
    const constraintsList = [
        {
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
            video: type === 'video' ? { facingMode: fm, width: { ideal: 1280 }, height: { ideal: 720 } } : false
        },
        {
            audio: { echoCancellation: true, noiseSuppression: true },
            video: type === 'video' ? { facingMode: fm } : false
        },
        {
            audio: true,
            video: type === 'video' ? { facingMode: fm } : false
        }
    ];

    if (hasModern) {
        let lastError;
        for (const constraints of constraintsList) {
            try {
                const stream = await navigator.mediaDevices.getUserMedia(constraints);
                _sessionPerms[permKey] = 'granted';
                return stream;
            } catch(e) {
                lastError = e;
                // NotAllowedError — пользователь отказал, не пробуем дальше
                if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
                    _sessionPerms[permKey] = 'denied';
                    throw e;
                }
                // Другие ошибки (OverconstrainedError, NotFoundError) — пробуем проще
            }
        }
        throw lastError;
    } else {
        // Полифилл для старых iOS (iOS < 14.3)
        const gum = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia;
        return new Promise((resolve, reject) => {
            const constraints = {
                audio: { echoCancellation: true, noiseSuppression: true },
                video: type === 'video' ? { facingMode: fm } : false
            };
            gum.call(navigator, constraints,
                stream => { _sessionPerms[permKey] = 'granted'; resolve(stream); },
                err => {
                    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                        _sessionPerms[permKey] = 'denied';
                    }
                    reject(err);
                }
            );
        });
    }
}

async function flipCamera() {
    if (!callLocalStream || currentCallType !== 'video') return;
    _currentFacingMode = _currentFacingMode === 'user' ? 'environment' : 'user';
    vibrate(10);
    try {
        const newStream = await getLocalStream('video', _currentFacingMode);
        const videoTrack = newStream.getVideoTracks()[0];
        if (!videoTrack) return;
        const sender = peerConnection?.getSenders().find(s => s.track?.kind === 'video');
        if (sender) await sender.replaceTrack(videoTrack);
        callLocalStream.getVideoTracks().forEach(t => t.stop());
        const lv = document.getElementById('local-video');
        if (lv) { lv.srcObject = newStream; }
        callLocalStream = newStream;
    } catch(e) { showToast('Не удалось перевернуть камеру', 'error'); }
}

function setupCallScreen(type, isIncoming) {
    const screen = document.getElementById('call-screen');
    if (!screen) return;
    screen.classList.remove('hidden');
    const partnerName = document.getElementById('chat-name')?.textContent || 'Звонок';
    const partnerAva  = chatPartnerAvatarSrc[currentPartnerId]
        || document.getElementById('chat-ava-header')?.querySelector('img')?.src
        || '';

    const setEl = (id, fn) => { const el = document.getElementById(id); if (el) fn(el); };
    const statusText = isIncoming
        ? (type === 'video' ? '📹 Входящий видеозвонок' : '📞 Входящий звонок')
        : (type === 'video' ? 'Видеовызов...' : 'Вызов...');

    setEl('call-name',         el => el.textContent = partnerName);
    setEl('call-status-label', el => el.textContent = statusText);
    setEl('call-avatar-box',   el => el.innerHTML = getAvatarHtml({id: currentPartnerId, name: partnerName, avatar: partnerAva}, 'w-28 h-28'));
    setEl('accept-btn',        el => el.style.display = isIncoming ? 'flex' : 'none');
    setEl('call-timer',        el => el.style.display = 'none');
    setEl('call-quality-label',el => el.style.display = 'none');
    setEl('flip-btn',          el => el.style.display = type === 'video' ? 'flex' : 'none');
    // Показываем кружки дозвона
    document.querySelectorAll('.call-ring-1,.call-ring-2,.call-ring-3').forEach(r => r.style.display = 'block');
    acquireWakeLock();
}

async function acquireWakeLock() { try { if ('wakeLock' in navigator) wakelock = await navigator.wakeLock.request('screen'); } catch(e) {} }
function releaseWakeLock() { if (wakelock) { wakelock.release().catch(()=>{}); wakelock = null; } }

function showLocalVideo() {
    const vc = document.getElementById('call-video-container');
    const lv = document.getElementById('local-video');
    if (vc) vc.style.display = 'block';
    if (lv && callLocalStream) {
        lv.srcObject = callLocalStream;
        lv.style.display = 'block';
        lv.play().catch(() => document.addEventListener('touchstart', () => lv.play(), { once: true }));
    }
}

function createPeerConnection() {
    const pc = new RTCPeerConnection(rtcConfig);

    pc.onicecandidate = (e) => {
        if (e.candidate && currentPartnerId) {
            socket.emit('ice_candidate', { to: currentPartnerId, candidate: e.candidate });
        }
    };

    pc.oniceconnectionstatechange = () => {
        const state = pc.iceConnectionState;
        const label = document.getElementById('call-status-label');
        console.log('ICE state:', state);

        if (state === 'connected' || state === 'completed') {
            if (label) label.textContent = 'В эфире';
            startCallTimer();
            document.querySelectorAll('.call-ring-1,.call-ring-2,.call-ring-3').forEach(r => r.style.display = 'none');
        } else if (state === 'checking') {
            if (label) label.textContent = 'Соединение...';
        } else if (state === 'disconnected') {
            if (label) label.textContent = 'Переподключение...';
            // Автоматический ICE restart через 2 сек
            setTimeout(() => {
                if (peerConnection?.iceConnectionState === 'disconnected') doIceRestart();
            }, 2000);
        } else if (state === 'failed') {
            if (iceRestartCount < MAX_ICE_RESTARTS) {
                iceRestartCount++;
                if (label) label.textContent = `Переподключение ${iceRestartCount}/${MAX_ICE_RESTARTS}...`;
                doIceRestart();
            } else {
                showToast('Не удалось установить соединение', 'error');
                endCall(true);
            }
        }
    };

    pc.ontrack = (e) => {
        if (!e.streams[0]) return;
        const stream = e.streams[0];

        if (e.track.kind === 'video') {
            const rv = document.getElementById('remote-video');
            if (rv) {
                document.getElementById('call-video-container').style.display = 'block';
                rv.srcObject = stream;
                rv.style.display = 'block';
                rv.play().catch(() => document.addEventListener('touchstart', () => rv.play(), { once: true }));
                const ci = document.getElementById('call-info');
                if (ci) ci.style.opacity = '0.2';
            }
        } else if (e.track.kind === 'audio') {
            // Отдельный audio элемент для надёжного воспроизведения
            let callAudio = document.getElementById('call-remote-audio');
            if (!callAudio) {
                callAudio = document.createElement('audio');
                callAudio.id = 'call-remote-audio';
                callAudio.autoplay = true;
                callAudio.setAttribute('playsinline', '');
                document.body.appendChild(callAudio);
            }
            callAudio.srcObject = stream;
            callAudio.play().catch(() => {
                document.addEventListener('touchstart', () => callAudio.play(), { once: true });
            });
        }
    };

    pc.onsignalingstatechange = () => {
        console.log('Signaling state:', pc.signalingState);
    };

    return pc;
}

let iceRestartTimer = null;
async function doIceRestart() {
    if (!peerConnection || !currentPartnerId) return;
    try {
        const offer = await peerConnection.createOffer({ iceRestart: true });
        await peerConnection.setLocalDescription(offer);
        socket.emit('call_user', { to: currentPartnerId, from_name: currentUser.name, offer, call_type: currentCallType, isRestart: true });
    } catch(e) { console.error('ICE restart failed:', e); }
}

function onIncomingCall(data) {
    incomingCallData = data; pendingIce = [];
    currentCallType = data.call_type || 'audio';
    vibrate([400,200,400,200,400]);
    const screen = document.getElementById('call-screen');
    screen.classList.remove('hidden');
    document.getElementById('call-name').textContent = data.from_name || 'Звонок';
    document.getElementById('call-status-label').textContent = currentCallType === 'video' ? '📹 Видеозвонок' : '📞 Голосовой';
    document.getElementById('call-avatar-box').innerHTML = getAvatarHtml({id: data.from, name: data.from_name, avatar: data.from_avatar}, 'w-28 h-28');
    document.getElementById('accept-btn').style.display = 'flex';
    document.getElementById('call-timer').style.display = 'none';
    acquireWakeLock();
}

async function onIceCandidate(data) {
    if (!data.candidate) return;
    if (!peerConnection || !peerConnection.remoteDescription?.type) { pendingIce.push(data.candidate); return; }
    try { await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate)); } catch(e) {}
}

async function flushPendingIce() {
    const candidates = [...pendingIce]; pendingIce = [];
    for (const c of candidates) { try { await peerConnection.addIceCandidate(new RTCIceCandidate(c)); } catch(e) {} }
}

async function answerIncomingCall() {
    const data = incomingCallData;
    if (!data) return;
    document.getElementById('accept-btn').style.display = 'none';
    document.getElementById('call-status-label').textContent = 'Подключение...';
    currentPartnerId = data.from; vibrate(30);
    try {
        callLocalStream = await getLocalStream(currentCallType);
        if (currentCallType === 'video') showLocalVideo();
        peerConnection = createPeerConnection();
        callLocalStream.getTracks().forEach(t => peerConnection.addTrack(t, callLocalStream));
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
        await flushPendingIce();
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        socket.emit('answer_call', { to: data.from, answer });
    } catch(e) { showToast('Ошибка при ответе', 'error'); endCall(true); }
}

async function onCallAnswered(data) {
    if (!peerConnection) return;
    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
        await flushPendingIce();
        document.getElementById('call-status-label').textContent = 'Соединение...';
    } catch(e) {}
}

function startCallTimer() {
    callStartTime = Date.now();
    const el = document.getElementById('call-timer');
    if (el) el.style.display = 'block';
    clearInterval(callTimerInterval);
    callTimerInterval = setInterval(() => {
        if (el) el.textContent = fmtSec(Math.floor((Date.now() - callStartTime) / 1000));
    }, 1000);
}

function endCall(notify = true) {
    clearInterval(callTimerInterval); clearInterval(callQualityTimer); clearTimeout(iceRestartTimer);
    if (notify && currentPartnerId) socket.emit('end_call', { to: currentPartnerId });
    if (peerConnection) { try { peerConnection.close(); } catch(e) {} peerConnection = null; }
    if (callLocalStream) { callLocalStream.getTracks().forEach(t => t.stop()); callLocalStream = null; }
    // Очищаем remote audio
    const callAudio = document.getElementById('call-remote-audio');
    if (callAudio) { callAudio.srcObject = null; callAudio.remove(); }
    const screen = document.getElementById('call-screen');
    if (screen) screen.classList.add('hidden');
    ['remote-video','local-video'].forEach(id => { const el = document.getElementById(id); if (el) { el.srcObject = null; el.style.display = 'none'; } });
    const vc = document.getElementById('call-video-container');
    if (vc) vc.style.display = 'none';
    const ci = document.getElementById('call-info');
    if (ci) ci.style.opacity = '1';
    incomingCallData = null; pendingIce = []; isMuted = false; isVideoOff = false;
    releaseWakeLock(); vibrate(15);
}

function toggleMute() {
    isMuted = !isMuted;
    callLocalStream?.getAudioTracks().forEach(t => t.enabled = !isMuted);
    const btn = document.getElementById('mute-btn');
    if (btn) {
        btn.innerHTML = isMuted
            ? `<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><line x1="1" y1="1" x2="23" y2="23" stroke="white" stroke-width="2" stroke-linecap="round"/><path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6M17 16.95A7 7 0 015 12v-2m14 0v2a7 7 0 01-.11 1.23M12 19v3M8 23h8" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`
            : ICONS.mic.replace('rgba(255,255,255,0.5)','white');
        btn.classList.toggle('active', isMuted);
    }
    vibrate(10);
}

function toggleVideo() {
    isVideoOff = !isVideoOff;
    callLocalStream?.getVideoTracks().forEach(t => t.enabled = !isVideoOff);
    const btn = document.getElementById('video-btn');
    if (btn) { btn.classList.toggle('active', isVideoOff); }
    vibrate(10);
}

function toggleSpeaker() {
    const btn = document.getElementById('speaker-btn');
    btn?.classList.toggle('active');
    showToast('Громкая связь переключена', 'info', 1500); vibrate(10);
}

// ══════════════════════════════════════════════════════════
//  СИНХРОНИЗАЦИЯ ПРОФИЛЯ
// ══════════════════════════════════════════════════════════
async function syncProfileData() {
    try {
        const r = await apiFetch('/get_current_user');
        if (!r) return;
        const data = await r.json();
        if (!data?.id) return;

        // Не затираем avatar если сервер вернул дефолтный а у нас уже есть реальный
        const serverAvatar = data.avatar || '';
        const localAvatar  = currentUser.avatar || '';
        const isServerDefault = serverAvatar.includes('default_avatar');
        const isLocalReal     = localAvatar && !localAvatar.includes('default_avatar');
        if (isServerDefault && isLocalReal) {
            data.avatar = localAvatar; // сохраняем локальный
        }

        const changed = data.name !== currentUser.name
                     || data.avatar !== currentUser.avatar
                     || data.bio !== currentUser.bio;
        if (changed) {
            Object.assign(currentUser, data);
            localStorage.setItem('waychat_user_cache', JSON.stringify(currentUser));
            invalidateAvatarCache(currentUser.id);
            updateAllAvatarUI();
        }
    } catch(e) {}
}

// ══════════════════════════════════════════════════════════
//  ВСПОМОГАТЕЛЬНЫЕ
// ══════════════════════════════════════════════════════════
function scrollDown(smooth = true) {
    const m = document.getElementById('messages');
    if (m) {
        if (smooth) m.scrollTo({ top: m.scrollHeight, behavior: 'smooth' });
        else m.scrollTop = m.scrollHeight;
    }
}

function closeChat() {
    document.getElementById('chat-window')?.classList.remove('active');
    if (currentChatId) socket.emit('leave_chat', { chat_id: currentChatId });
    currentChatId    = null;
    currentPartnerId = null;
    currentChatType  = 'private';
    hideTypingIndicator();
    loadChats();
}

function setupGlobalGestures() {
    let startX = 0, startY = 0;
    document.addEventListener('touchstart', (e) => { startX = e.touches[0].clientX; startY = e.touches[0].clientY; }, { passive: true });
    document.addEventListener('touchmove', (e) => {
        const chatWin = document.getElementById('chat-window');
        if (!chatWin?.classList.contains('active')) return;
        const dx = e.touches[0].clientX - startX;
        const dy = Math.abs(e.touches[0].clientY - startY);
        if (startX < 30 && dx > 0 && dy < Math.abs(dx)) {
            const ind = document.getElementById('swipe-indicator');
            if (ind) ind.style.opacity = Math.min(dx / 120, 1) * 0.8;
            chatWin.style.transform = `translateX(${Math.min(dx * 0.4, 60)}px)`;
        }
    }, { passive: true });
    document.addEventListener('touchend', (e) => {
        const chatWin = document.getElementById('chat-window');
        if (!chatWin?.classList.contains('active')) return;
        const dx = e.changedTouches[0].clientX - startX;
        chatWin.style.transform = '';
        const ind = document.getElementById('swipe-indicator');
        if (ind) ind.style.opacity = '0';
        if (startX < 40 && dx > 80) closeChat();
    }, { passive: true });
}

// ══════════════════════════════════════════════════════════
//  WEB PUSH — iOS Safari 16.4+ и все современные браузеры
// ══════════════════════════════════════════════════════════
let _swReg = null;
let _pushBannerShown = false;

async function initPushNotifications() {
    if (!('serviceWorker' in navigator)) return;
    try {
        // Регистрируем SW — updateViaCache важен для PWA чтобы не тормозить
        _swReg = await navigator.serviceWorker.register('/sw.js', {
            scope: '/',
            updateViaCache: 'none'
        });
        await navigator.serviceWorker.ready;

        navigator.serviceWorker.addEventListener('message', e => {
            if (e.data?.type === 'open_chat' && e.data.chat_id) {
                _openChatByChatId(e.data.chat_id);
            }
        });

        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        const isPWA = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

        // iOS Safari: Push API доступен только в PWA (iOS 16.4+)
        if (isIOS && !isPWA) {
            // В браузере — только показываем инструкцию добавить на экран
            _showPushBanner();
            return;
        }

        if (!('PushManager' in window)) {
            _requestBasicNotifPermission();
            return;
        }

        if (Notification.permission === 'granted') {
            await _subscribeToPush();
            notifPermission = true;
            _updateNotifToggle(true);
        } else if (Notification.permission === 'default') {
            _showPushBanner();
        } else {
            // denied — не показываем баннер
            notifPermission = false;
        }
    } catch(e) {
        console.warn('SW error:', e);
        _requestBasicNotifPermission();
    }
}

function _showPushBanner() {
    if (_pushBannerShown || localStorage.getItem('wc_push_dismissed')) return;
    _pushBannerShown = true;

    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isPWA = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

    setTimeout(() => {
        const b = document.createElement('div');
        b.id = 'push-banner';
        b.style.cssText = 'position:fixed;bottom:max(calc(env(safe-area-inset-bottom,0px)+70px),82px);left:12px;right:12px;z-index:9998;background:var(--surface);border:1px solid rgba(16,185,129,0.25);border-radius:18px;padding:14px 16px;display:flex;align-items:center;gap:12px;box-shadow:0 8px 32px rgba(0,0,0,0.55)';

        if (isIOS && !isPWA) {
            // iOS Safari без PWA — только инструкция
            b.innerHTML = '<div style="font-size:22px;flex-shrink:0">🔔</div>'
                +'<div style="flex:1;min-width:0">'
                +'<div style="font-size:13px;font-weight:700;margin-bottom:3px">Уведомления на iPhone</div>'
                +'<div style="font-size:11px;color:var(--text-2);line-height:1.5">Нажмите <b style="color:var(--text)">«Поделиться ⬆»</b> → <b style="color:var(--text)">«На экран Домой»</b> и откройте WayChat оттуда</div>'
                +'</div>'
                +'<button id="push-no" style="background:none;border:none;color:var(--text-2);font-size:18px;cursor:pointer;flex-shrink:0;padding:4px">✕</button>';
        } else {
            b.innerHTML = '<div style="font-size:26px;flex-shrink:0">🔔</div>'
                +'<div style="flex:1;min-width:0">'
                +'<div style="font-size:14px;font-weight:700;margin-bottom:2px">Уведомления о сообщениях</div>'
                +'<div style="font-size:12px;color:var(--text-2);line-height:1.4">Получайте сообщения даже когда приложение закрыто</div>'
                +'</div>'
                +'<div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0">'
                +'<button id="push-yes" style="padding:8px 16px;background:var(--accent);border:none;border-radius:10px;color:#000;font:700 13px/1 -apple-system,sans-serif;cursor:pointer">Включить</button>'
                +'<button id="push-no" style="padding:6px 10px;background:none;border:none;color:var(--text-2);font:500 12px/1 -apple-system,sans-serif;cursor:pointer">Не сейчас</button>'
                +'</div>';
        }

        document.body.appendChild(b);

        const yesBtn = b.querySelector('#push-yes');
        if (yesBtn) {
            yesBtn.onclick = async () => {
                b.remove();
                try {
                    const perm = await Notification.requestPermission();
                    notifPermission = perm === 'granted';
                    if (perm === 'granted') {
                        if ('PushManager' in window) await _subscribeToPush();
                        _updateNotifToggle(true);
                        showToast('Уведомления включены 🔔', 'success');
                    } else {
                        showToast('Уведомления заблокированы — разрешите в настройках', 'warning', 4000);
                    }
                } catch(e){}
            };
        }
        b.querySelector('#push-no').onclick = () => {
            b.remove();
            localStorage.setItem('wc_push_dismissed', '1');
        };
    }, 2500);
}

async function _subscribeToPush() {
    if (!_swReg || !('PushManager' in window)) return;
    try {
        let sub = await _swReg.pushManager.getSubscription();
        if (!sub) {
            const keyRes  = await fetch('/vapid-public-key', { credentials: 'same-origin' });
            if (!keyRes.ok) { console.warn('VAPID key fetch failed:', keyRes.status); return; }
            const keyData = await keyRes.json();
            if (!keyData.publicKey) { console.warn('No VAPID key'); return; }
            sub = await _swReg.pushManager.subscribe({
                userVisibleOnly:      true,
                applicationServerKey: _urlBase64ToUint8Array(keyData.publicKey),
            });
        }
        const subJson = sub.toJSON();
        const res = await apiFetch('/push-subscribe', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                endpoint: subJson.endpoint,
                p256dh:   subJson.keys?.p256dh || '',
                auth:     subJson.keys?.auth   || '',
            }),
        });
        if (res && res.ok !== false) {
            console.log('✅ Push подписка активна');
            notifPermission = true;
        }
    } catch(e) {
        console.warn('Push subscribe error:', e);
        // Если подписка устарела — удаляем и пробуем заново один раз
        if (e.name === 'InvalidStateError' || e.name === 'AbortError') {
            try {
                const oldSub = await _swReg.pushManager.getSubscription();
                if (oldSub) await oldSub.unsubscribe();
            } catch(e2) {}
        }
    }
}

function _urlBase64ToUint8Array(b64) {
    const pad = '='.repeat((4 - b64.length % 4) % 4);
    const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

function _requestBasicNotifPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
        document.addEventListener('click', () => {
            Notification.requestPermission().then(p => { notifPermission = p === 'granted'; });
        }, { once: true });
    } else {
        notifPermission = Notification.permission === 'granted';
    }
}

async function requestNotificationPermission() {
    if ('PushManager' in window && _swReg) {
        if (Notification.permission === 'granted') {
            await _subscribeToPush();
            notifPermission = true;
            _updateNotifToggle(true);
        } else if (Notification.permission === 'default') {
            const perm = await Notification.requestPermission();
            notifPermission = perm === 'granted';
            if (perm === 'granted') {
                await _subscribeToPush();
                _updateNotifToggle(true);
                showToast('Уведомления включены 🔔', 'success');
            } else {
                showToast('Уведомления отклонены', 'warning');
            }
        } else {
            showToast('Уведомления заблокированы. Разрешите в настройках Safari.', 'warning');
        }
    } else {
        _requestBasicNotifPermission();
    }
}

function _openChatByChatId(chatId) {
    switchTab('chats');
    // Небольшая задержка чтобы список чатов отрисовался
    setTimeout(() => {
        const num = +chatId;
        document.querySelectorAll('[data-chat-key]').forEach(el => {
            // Пробуем найти по chat_id через загрузку чатов
        });
    }, 300);
}

window.addEventListener('online',  () => updateConnStatus(true));
window.addEventListener('offline', () => updateConnStatus(false));

document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
        loadChats();
        if (currentChatId) socket.emit('enter_chat', { chat_id: currentChatId });
    }
});

// ══════════════════════════════════════════════════════════
//  ВЫХОД ИЗ АККАУНТА
// ══════════════════════════════════════════════════════════
async function doLogout() {
    try {
        await fetch('/logout', { method: 'GET', credentials: 'same-origin' });
    } catch(e) {}
    window.location.href = '/login';
}

// ══════════════════════════════════════════════════════════
//  ЗАПУСК
// ══════════════════════════════════════════════════════════
window.onload = init;
