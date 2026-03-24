/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║          WAYCHAT ULTIMATE ENGINE 2026                        ║
 * ║          Version: 9.0.0 — TG INPUT · FULLSCREEN · ASYNC     ║
 * ║  Telegram input · Photo zoom · Inline time · Async upload   ║
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
// ══ iOS SAFARI FIX v10 — единственный механизм (FIXED) ═════════
(function(){
    'use strict';

    // ── ОДИН источник правды для высоты viewport ──
    // index.html уже устанавливает --app-height через visualViewport.
    // Этот блок синхронизирует --vh для совместимости с остальным кодом.
    function syncVH() {
        const h = window.visualViewport
            ? window.visualViewport.height
            : window.innerHeight;
        const root = document.documentElement;
        root.style.setProperty('--vh',         h + 'px');
        root.style.setProperty('--app-height', h + 'px');
        root.style.setProperty('--dvh',        (h * 0.01) + 'px');
    }

    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', function() {
            syncVH();
            // При открытой клавиатуре — только скроллим вниз.
            // НЕ трогаем chatWin.style.height — flex layout справляется сам.
            const vv   = window.visualViewport;
            const kbH  = Math.max(0, window.innerHeight - vv.height);
            const chat = document.getElementById('chat-window');
            const msgs = document.getElementById('messages');
            // BUG-G FIX: only scroll if user was already at the bottom
            if (chat && chat.classList.contains('active') && kbH > 60 && msgs) {
                if (_isNearBottom(msgs)) {
                    requestAnimationFrame(function() {
                        msgs.scrollTop = msgs.scrollHeight;
                    });
                }
            }
        }, { passive: true });
        window.visualViewport.addEventListener('scroll', syncVH, { passive: true });
    }
    window.addEventListener('resize', syncVH, { passive: true });
    window.addEventListener('orientationchange', function() {
        setTimeout(syncVH, 150);
    }, { passive: true });
    syncVH();

    // ── CSS исправления (патч поверх основных стилей) ──
    const st = document.createElement('style');
    st.id = 'wc-ios10';
    st.textContent = `
        /* ═══ ЯДЕРНОЕ УНИЧТОЖЕНИЕ СЕРОЙ ПОЛОСЫ ═══
           position:fixed inset:0 — единственный надёжный способ на iOS Safari.
           100dvh НЕ работает на iPhone с home indicator. */
        html, body {
            background: #1d1d1e !important;
            margin: 0 !important; padding: 0 !important;
            height: 100% !important; width: 100% !important;
            overflow: hidden !important;
            -webkit-text-size-adjust: 100% !important;
        }
        #app {
            position: fixed !important;
            top: 0 !important; left: 0 !important;
            right: 0 !important; bottom: 0 !important;
            width: 100% !important; height: 100% !important;
            overflow: hidden !important;
            padding: 0 !important; margin: 0 !important;
            background: #1d1d1e !important;
        }
        /* Убиваем любой padding-bottom у прямых детей #app */
        #app > * { padding-bottom: 0 !important; margin-bottom: 0 !important; }
        /* Убиваем серый фон который может просвечивать под #app */
        * { -webkit-tap-highlight-color: transparent !important; }
        /* chat-view: flex-колонка на весь экран */
        /* FIX P1: inset:0 + position:fixed уже задаёт 100% — 100dvh избыточен
           и конфликтует с safe-area на iPhone с home indicator */
        .chat-view {
            position: fixed !important;
            inset: 0 !important;
            top: 0 !important; left: 0 !important;
            right: 0 !important; bottom: 0 !important;
            height: 100% !important;
            display: flex !important;
            flex-direction: column !important;
            overflow: hidden !important;
            margin: 0 !important; padding: 0 !important;
        }
        .chat-view.active { transform: translateX(0) !important; }
        /* FIX P1+P2: messages занимает всё пространство между header и input-bar;
           padding-bottom резервирует место для плавающего input-bar (~64px capsule + safe-area) */
        #messages {
            flex: 1 1 0% !important;
            min-height: 0 !important;
            overflow-y: auto !important;
            overflow-x: hidden !important;
            -webkit-overflow-scrolling: touch !important;
            overscroll-behavior-y: contain !important;
            margin: 0 !important;
            padding-top: 4px !important;
        }
        /* INPUT BAR — в потоке flex-колонки, поднят над home indicator, без серой полосы */
        .input-bar {
            position: relative !important;
            bottom: auto !important;
            left: auto !important; right: auto !important;
            transform: none !important;
            z-index: 10 !important;
            background: var(--chat-bg, #1d1d1e) !important;
            padding: 8px 12px !important;
            padding-bottom: max(env(safe-area-inset-bottom, 12px), 14px) !important;
            pointer-events: all !important;
            flex-shrink: 0 !important;
            border-top: none !important;
        }
        .input-bar > * { pointer-events: all !important; }
        /* Убрать белую обводку у поля ввода */
        .tg-text-wrap, .tg-text-wrap:focus-within {
            outline: none !important;
            border: none !important;
            box-shadow: none !important;
            -webkit-appearance: none !important;
        }
        #msg-input {
            outline: none !important;
            border: none !important;
            box-shadow: none !important;
            -webkit-appearance: none !important;
        }
        /* messages: нижний padding небольшой — input-bar теперь в потоке */
        #messages {
            padding-bottom: 4px !important;
        }
        /* header: не сжимается */
        #chat-header { flex-shrink: 0 !important; background:var(--chat-bg,#1d1d1e) !important; backdrop-filter:none !important; -webkit-backdrop-filter:none !important; border-bottom:none !important; }
        /* FAB: всегда поверх и кликабельна */
        .fab-btn {
            pointer-events: all !important;
            z-index: 950 !important;
            touch-action: manipulation !important;
            /* FAB опускается к реальному низу экрана */
            bottom: 16px !important;
        }
        .fab-plus  { pointer-events: all !important; z-index: 951 !important; touch-action: manipulation !important; }
        .fab-menu  { z-index: 952 !important; }
        .fab-bd    { z-index: 948 !important; }
        /* main-content: padding-bottom = 0, safe-area только в input-bar */
        #main-content {
            padding-bottom: 0 !important;
            -webkit-overflow-scrolling: touch;
            overscroll-behavior: contain;
        }
        /* sticky search — NO borders, NO shadow, NO outline */
        #chat-search-bar {
            position: sticky !important;
            top: 0 !important;
            z-index: 100 !important;
            background: var(--bg, #1d1d1e) !important;
            border: none !important;
            box-shadow: none !important;
            outline: none !important;
        }
        #search-box-wrap, #search-box-wrap * {
            border: none !important;
            outline: none !important;
            box-shadow: none !important;
        }
        /* Input bar — прозрачный floating (основные стили уже выше в этом блоке) */
        .input-bar { border: none !important; }
        /* iOS: минимум 16px предотвращает авто-зум при фокусе */
        input, textarea, select { font-size: max(16px, 1em) !important; }
        body { -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
        *, button, a, [onclick], [data-msg-id] { -webkit-tap-highlight-color: transparent; }
        .vl-ph { flex-shrink: 0; width: 100%; pointer-events: none; }
        #app, #main-content, .prof-sheet-inner { touch-action: pan-x pan-y; }
        /* Offline banner */
        #wc-off {
            position: fixed;
            top: max(env(safe-area-inset-top,0px),0px);
            left: 0; right: 0; z-index: 99997;
            background: rgba(239,68,68,.97); color: #fff;
            padding: 8px 16px; text-align: center;
            font-size: 13px; font-weight: 700;
            transform: translateY(-100%); transition: transform .3s ease;
        }
        #wc-off.v { transform: translateY(0); }
        /* Skeleton animation */
        @keyframes wcSkPulse { 0%,100%{opacity:.35} 50%{opacity:.75} }
        .wc-skeleton { animation: wcSkPulse 1.5s ease-in-out infinite; background: rgba(255,255,255,0.07); }
    `;
    document.head.appendChild(st);

    // ── Offline banner ──
    const ob = () => {
        let e = document.getElementById('wc-off');
        if (!e) {
            e = document.createElement('div');
            e.id = 'wc-off';
            e.textContent = '📡 Нет подключения';
            document.body.appendChild(e);
        }
        return e;
    };
    window.addEventListener('offline', () => ob().classList.add('v'));
    window.addEventListener('online',  () => ob().classList.remove('v'));
    if (!navigator.onLine) setTimeout(() => ob().classList.add('v'), 600);

    // ── Service Worker update pill ──
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('message', e => {
            if (e.data?.type !== 'SW_UPDATED') return;
            if (!document.getElementById('chat-window')?.classList.contains('active')) {
                setTimeout(() => location.reload(), 400); return;
            }
            let p = document.getElementById('wc-sw-pill');
            if (!p) {
                p = document.createElement('div');
                p.id = 'wc-sw-pill';
                p.style.cssText = 'position:fixed;top:max(env(safe-area-inset-top,10px),10px);left:50%;transform:translateX(-50%) translateY(-60px);z-index:99999;background:rgba(16,185,129,.97);color:#000;padding:10px 22px;border-radius:24px;font-size:14px;font-weight:800;box-shadow:0 4px 24px rgba(0,0,0,.4);cursor:pointer;white-space:nowrap;transition:transform .35s cubic-bezier(.34,1.56,.64,1)';
                p.textContent = '🆕 Обновление — нажмите';
                p.onclick = () => location.reload();
                document.body.appendChild(p);
            }
            requestAnimationFrame(() => { p.style.transform = 'translateX(-50%) translateY(0)'; });
            setTimeout(() => { p.style.transform = 'translateX(-50%) translateY(-60px)'; }, 12000);
        });
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (document.hidden) window._swr = true;
        });
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && window._swr) { window._swr = false; location.reload(); }
        });
    }

})();

// ══ VirtualList ═══════════════════════════════════════════════
const VirtualList=(()=>{
    const OV=18,EH=76,BA=50;
    let el=null,ms=[],s=0,e=0,tp=null,bp=null,ts=null,bs=null,hc=new Map(),rf=null;
    const gh=i=>hc.get(i)||EH;
    const gs=(a,b)=>{let r=0;for(let i=a;i<b;i++)r+=gh(i);return r;};
    function msr(){if(!el)return;el.querySelectorAll('[data-vi]').forEach(n=>{const h=n.offsetHeight;if(h>8)hc.set(+n.dataset.vi,h);});}
    function phs(){if(tp)tp.style.height=gs(0,s)+'px';if(bp)bp.style.height=gs(e,ms.length)+'px';}
    function ld(i){for(let j=i-1;j>=0;j--){const d=getMessageDate(ms[j]);if(d)return d;}return null;}
    function win(ns,ne,ks){
        if(!el||!ms.length)return;ns=Math.max(0,ns);ne=Math.min(ms.length,ne);if(ns===s&&ne===e)return;
        let an=null,of=0;if(ks){an=el.querySelector('[data-vi]');if(an)of=an.getBoundingClientRect().top;}
        const f=document.createDocumentFragment();let ld2=ld(ns);
        for(let i=ns;i<ne;i++){const m=ms[i],d=getMessageDate(m);if(d&&d!==ld2){const dv=document.createElement('div');dv.className='date-divider';dv.dataset.vd=d;dv.innerHTML=`<div class="date-divider-inner">${d}</div>`;f.appendChild(dv);ld2=d;}const r=buildMessageRow(m,false);r.dataset.vi=i;f.appendChild(r);}
        el.querySelectorAll('[data-vi],[data-vd]').forEach(n=>n.remove());ts.after(f);s=ns;e=ne;msr();phs();
        if(ks&&an){const na=el.querySelector('[data-vi="'+s+'"]');if(na)el.scrollTop+=na.getBoundingClientRect().top-of;}
    }
    function calc(){if(!el||!ms.length)return;const st=el.scrollTop,ch=el.clientHeight;let cum=0,vs=0,ve=ms.length;for(let i=0;i<ms.length;i++){const h=gh(i);if(cum+h>st&&vs===0)vs=i;if(cum>st+ch){ve=i;break;}cum+=h;}win(Math.max(0,vs-OV),Math.min(ms.length,ve+OV),true);}
    function onsc(){if(el.scrollTop<140&&typeof hasMoreMessages!=='undefined'&&hasMoreMessages&&!loadingMessages&&typeof loadMessages==='function')loadMessages(false);if(rf)cancelAnimationFrame(rf);rf=requestAnimationFrame(calc);}
    function mount(el2){if(el)destroy();el=el2;ms=[];hc.clear();s=0;e=0;el.style.overflowY='auto';el.style.WebkitOverflowScrolling='touch';el.style.overscrollBehavior='contain';ts=document.createElement('div');ts.style.cssText='height:1px;flex-shrink:0';tp=document.createElement('div');tp.className='vl-ph';tp.style.height='0';bp=document.createElement('div');bp.className='vl-ph';bp.style.height='0';bs=document.createElement('div');bs.style.cssText='height:1px;flex-shrink:0';el.appendChild(ts);el.appendChild(tp);el.appendChild(bp);el.appendChild(bs);el.addEventListener('scroll',onsc,{passive:true});}
    function setMessages(arr){if(!el)return;ms=arr.slice();hc.clear();s=0;e=0;el.querySelectorAll('[data-vi],[data-vd]').forEach(n=>n.remove());phs();if(!arr.length){el.innerHTML='<div style="padding:60px 0;text-align:center;opacity:.2"><div style="font-size:40px;margin-bottom:10px">👋</div><p>Начните переписку!</p></div>';return;}if(!el.contains(ts)){el.innerHTML='';mount(el);}win(Math.max(0,arr.length-BA),arr.length,false);
        // FIXED: triple rAF + fallback timer — гарантирует что DOM отрисован
        function _scrollAfterRender(attempt) {
            if (attempt > 5) return;
            requestAnimationFrame(function() {
                if (!el) return;
                if (el.scrollHeight > el.clientHeight + 10) {
                    el.scrollTop = el.scrollHeight;
                    _scrollAtBottom = true; _scrollUnread = 0;
                    _updateScrollBtn(el); _ensureScrollBtn(); _attachScrollListener(el);
                } else {
                    _scrollAfterRender(attempt + 1);
                }
            });
        }
        _scrollAfterRender(0);}
    function append(msg){if(!el)return;
        // FIX DUPLICATE: if real msg arrives, remove optimistic row with same content from same sender
        if(!msg._optimistic && msg.id){
            // Remove matching optimistic DOM rows
            el.querySelectorAll('[data-optimistic="1"]').forEach(function(optEl){
                if(optEl.dataset.content===(msg.content||'') && String(msg.sender_id)===String(typeof currentUser!=='undefined'?currentUser.id:''))optEl.remove();
            });
            // Remove matching temp entries from ms array (tmp_ prefixed)
            const prevLen=ms.length;
            ms=ms.filter(function(m){return!(String(m.id).startsWith('tmp_')&&(m.content||'')===(msg.content||''));});
            if(ms.length<prevLen){hc.clear();s=0;e=0;}
            // Dedup by real id
            if(ms.some(function(m){return String(m.id)===String(msg.id);}))return;
        }
        ms.push(msg);const idx=ms.length-1;const ab=el.scrollHeight-el.scrollTop-el.clientHeight<120; // FIX Task 2a: 120px threshold
    if(e>=idx){const f=document.createDocumentFragment();const d=getMessageDate(msg),ld2=ld(idx);if(d&&d!==ld2){const dv=document.createElement('div');dv.className='date-divider';dv.dataset.vd=d;dv.innerHTML=`<div class="date-divider-inner">${d}</div>`;f.appendChild(dv);}const r=buildMessageRow(msg,true);if(!r)return;r.dataset.vi=idx;f.appendChild(r);bs.before(f);e=ms.length;msr();phs();
        if(ab){
            // FIX Task 2a: user near bottom — auto scroll
            requestAnimationFrame(function(){el.scrollTop=el.scrollHeight;});
            _scrollAtBottom=true;_scrollUnread=0;
        } else {
            // FIX Task 2a: user scrolled up — show badge, don't scroll
            _scrollAtBottom=false;
            const isMine = typeof currentUser!=='undefined' && msg.sender_id===currentUser.id;
            if(!isMine){ _scrollUnread++; }
        }
        _updateScrollBtn(el);
    }}
    function prepend(arr){
        if(!el||!arr.length)return;
        // BUG-E FIX: deduplicate by message ID before prepend
        const existIds = new Set(ms.map(m => m.id));
        arr = arr.filter(m => !existIds.has(m.id));
        if(!arr.length) return;
        ms=[...arr,...ms];const nh=new Map();hc.forEach((v,k)=>nh.set(k+arr.length,v));hc=nh;s+=arr.length;e+=arr.length;const ph=el.scrollHeight;win(Math.max(0,s-arr.length),e,false);requestAnimationFrame(()=>{el.scrollTop+=el.scrollHeight-ph;});}
    function toBottom(a){if(!el)return;a?el.scrollTo({top:el.scrollHeight,behavior:'smooth'}):(el.scrollTop=el.scrollHeight);
        // FIX SCROLL-BTN: force-hide button instantly after scrolling to bottom
        requestAnimationFrame(function(){_scrollAtBottom=true;_scrollUnread=0;_updateScrollBtn(el);});}
    function destroy(){if(!el)return;el.removeEventListener('scroll',onsc);if(rf)cancelAnimationFrame(rf);ms=[];hc.clear();el=ts=bs=tp=bp=null;}
    return{mount,setMessages,appendMessage:append,prependMessages:prepend,scrollToBottom:toBottom,destroy};
})();

// ══ SCROLL UTILITY — Telegram-grade ════════════════════════════════
// FIX Task 2a: single utility, uses scrollTop NOT scrollIntoView (iOS jank)
// OPT: requestAnimationFrame wrapping to batch DOM reads/writes

let _scrollUnread = 0;
let _scrollAtBottom = true;
let _scrollListenerAttached = false;

/**
 * scrollToBottom(el, instant)
 * el      — the scrollable messages container
 * instant — true = no animation (on open), false = smooth (new message)
 * FIX: never uses scrollIntoView — that causes jank on iOS Safari
 */
function scrollToBottom(el, instant) {
    if (!el) return;
    if (instant) {
        // OPT: direct assignment is synchronous and jank-free
        el.scrollTop = el.scrollHeight;
    } else {
        requestAnimationFrame(function() {
            el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
        });
    }
    _scrollUnread  = 0;
    _scrollAtBottom = true;
    _updateScrollBtn(el);
}

function _isNearBottom(el) {
    if (!el) return true;
    return (el.scrollHeight - el.scrollTop - el.clientHeight) < 120;
}

// OPT: debounced at 16ms (one frame) — prevents scroll-handler thrashing
let _scrollDebounceTimer = null;
function _onMessagesScroll(el) {
    if (_scrollDebounceTimer) return;
    _scrollDebounceTimer = setTimeout(function() {
        _scrollDebounceTimer = null;
        _scrollAtBottom = _isNearBottom(el);
        if (_scrollAtBottom) {
            _scrollUnread = 0;
        }
        _updateScrollBtn(el);
        // Pagination: load older messages when near top
        if (el.scrollTop < 80 && typeof loadMessages === 'function' &&
            hasMoreMessages && !loadingMessages) {
            loadMessages(false);
        }
    }, 16);
}

function _attachScrollListener(el) {
    if (!el) return;
    // FIXED: всегда снимаем старый и вешаем новый — иначе теряется при переходе между чатами
    el.removeEventListener('scroll', el._wcScrollHandler);
    el._wcScrollHandler = function() { _onMessagesScroll(el); };
    el.addEventListener('scroll', el._wcScrollHandler, { passive: true });
    _scrollListenerAttached = true;
}

// ── Scroll-to-bottom button (Task 2b) ───────────────────────────────
function _ensureScrollBtn() {
    if (document.getElementById('wc-scroll-btn')) return;
    var chatWin = document.getElementById('chat-window');
    if (!chatWin) return;

    var btn = document.createElement('button');
    btn.id = 'wc-scroll-btn';
    btn.setAttribute('aria-label', 'Прокрутить вниз');
    // OPT: CSS transitions only (opacity + translateY) — no JS animation lib
    btn.style.cssText = [
        'position:absolute',
        'right:14px',
        'bottom:72px',
        'width:42px',
        'height:42px',
        'border-radius:50%',
        'background:rgba(29,29,30,0.95)',
        'backdrop-filter:blur(12px)',
        '-webkit-backdrop-filter:blur(12px)',
        'border:0.5px solid rgba(255,255,255,0.14)',
        'color:#fff',
        'font-size:0',
        'display:flex',
        'align-items:center',
        'justify-content:center',
        'box-shadow:0 4px 18px rgba(0,0,0,0.45)',
        'z-index:500',
        'cursor:pointer',
        'opacity:0',
        'pointer-events:none',
        // OPT: CSS transition — GPU composited, no layout
        'transition:opacity .2s ease, transform .2s cubic-bezier(.34,1.56,.64,1)',
        'transform:translateY(10px)',
        '-webkit-tap-highlight-color:transparent',
    ].join(';');
    btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none">' +
        '<path d="M19 9l-7 7-7-7" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>' +
        '</svg>' +
        '<span id="wc-scroll-badge" style="display:none;position:absolute;top:-5px;right:-5px;' +
        'min-width:18px;height:18px;background:#ef4444;color:#fff;font-size:10px;font-weight:800;' +
        'border-radius:9px;padding:0 4px;align-items:center;justify-content:center;' +
        'border:1.5px solid rgba(29,29,30,0.9)"></span>';

    chatWin.style.position = 'relative';
    chatWin.appendChild(btn);

    btn.addEventListener('click', function() {
        var msgs = document.getElementById('messages');
        _scrollUnread = 0;
        scrollToBottom(msgs, false);
        // Mark messages read
        if (currentChatId) {
            socket.emit('mark_read', { chat_id: currentChatId });
        }
    });
}

function _updateScrollBtn(el) {
    var btn   = document.getElementById('wc-scroll-btn');
    var badge = document.getElementById('wc-scroll-badge');
    if (!btn) return;

    var distFromBottom = el
        ? Math.max(0, (el.scrollHeight - el.scrollTop - el.clientHeight))
        : 0;
    var show = distFromBottom > 120;

    // OPT: only mutate style when state changes
    if (show) {
        btn.style.opacity        = '1';
        btn.style.pointerEvents  = 'auto';
        btn.style.transform      = 'translateY(0)';
    } else {
        btn.style.opacity        = '0';
        btn.style.pointerEvents  = 'none';
        btn.style.transform      = 'translateY(10px)';
    }

    if (badge) {
        if (_scrollUnread > 0 && show) {
            badge.style.display  = 'flex';
            badge.textContent    = _scrollUnread > 99 ? '99+' : String(_scrollUnread);
        } else {
            badge.style.display  = 'none';
            badge.textContent    = '';
        }
    }
}
// ══ END SCROLL UTILITY ═════════════════════════════════════════════





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
    check: `<svg width="16" height="12" viewBox="0 0 16 12" fill="none" xmlns="http://www.w3.org/2000/svg">
  <!-- Main peak -->
  <path d="M1 11 L5.5 3.5 L7 5.5 L8.5 3 L14 11 Z"
        fill="currentColor" fill-opacity="0.35"
        stroke="currentColor" stroke-width="1.1"
        stroke-linejoin="round" stroke-linecap="round"/>
  <!-- Snow cap -->
  <path d="M7 5.5 L8.5 3 L10 5.5 Z"
        fill="currentColor" fill-opacity="0.7"/>
</svg>`,
    checkDouble: `<svg width="22" height="12" viewBox="0 0 22 12" fill="none" xmlns="http://www.w3.org/2000/svg">
  <!-- Back mountain (left, slightly lower) -->
  <path d="M1 11 L5 4.5 L9 11 Z"
        fill="currentColor" fill-opacity="0.25"
        stroke="currentColor" stroke-width="1.0"
        stroke-linejoin="round"/>
  <!-- Front mountain (right, taller) -->
  <path d="M7 11 L12.5 2.5 L14 4.5 L18 2 L21 11 Z"
        fill="currentColor" fill-opacity="0.4"
        stroke="currentColor" stroke-width="1.1"
        stroke-linejoin="round" stroke-linecap="round"/>
  <!-- Snow cap on front peak -->
  <path d="M14 4.5 L18 2 L20 4.5 Z"
        fill="currentColor" fill-opacity="0.75"/>
</svg>`,
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

// Хелпер для иконок разрешений
function _permIcon(key) {
    const svgs = {
        MIC:  `<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="9" y="2" width="6" height="11" rx="3" stroke="currentColor" stroke-width="2"/><path d="M19 10v2a7 7 0 01-14 0v-2M12 19v3M8 22h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
        CAM:  `<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="13" r="4" stroke="currentColor" stroke-width="2"/></svg>`,
        BELL: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
    };
    return svgs[key] || key;
}

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
let currentCallId     = null;
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

// Дебаунс — предотвращает спам запросами при быстрых действиях
function debounce(fn, ms) {
    let t = null;
    return function(...args) { clearTimeout(t); t = setTimeout(() => fn.apply(this, args), ms); };
}
let _viewedMomentUsers = (() => {
    try { return new Set(JSON.parse(localStorage.getItem('wc_viewed_moments') || '[]').map(Number)); }
    catch(e) { return new Set(); }
})();

// ── Кеш медиа в памяти ──
const _mediaCache = new Map();
// ══ RESTORED GLOBAL VARS ══
const MsgDB = (() => {
    const DB = 'wc_m2', V = 1, ST = 'm', TTL = 7 * 864e5;
    let _db = null;

    function op() {
        if (_db) return Promise.resolve(_db);
        return new Promise((r, j) => {
            const q = indexedDB.open(DB, V);
            q.onupgradeneeded = e => {
                const d = e.target.result;
                if (!d.objectStoreNames.contains(ST)) d.createObjectStore(ST);
            };
            q.onsuccess = e => { _db = e.target.result; r(_db); };
            q.onerror   = () => j(q.error);
        });
    }

    async function load(k) {
        try {
            const db  = await op();
            const row = await new Promise(r => {
                const tx = db.transaction(ST, 'readonly');
                const q  = tx.objectStore(ST).get(k);
                q.onsuccess = () => r(q.result ?? null);
                q.onerror   = () => r(null);
            });
            if (!row || Date.now() - row.ts > TTL) return null;
            return row.msgs;
        } catch { return null; }
    }

    async function save(k, msgs) {
        try {
            const db = await op();
            return new Promise(r => {
                const tx = db.transaction(ST, 'readwrite');
                tx.objectStore(ST).put({ msgs: msgs.slice(-300), ts: Date.now() }, k);
                tx.oncomplete = () => r(true);
                tx.onerror    = () => r(false);
            });
        } catch { return false; }
    }

    // FIX: delete specific chat messages from IndexedDB
    async function del(k) {
        try {
            const db = await op();
            return new Promise(r => {
                const tx = db.transaction(ST, 'readwrite');
                tx.objectStore(ST).delete(k);
                tx.oncomplete = () => r(true);
                tx.onerror    = () => r(false);
            });
        } catch { return false; }
    }

    // FIX: wipe all cached messages (logout / reset)
    async function clear() {
        try {
            const db = await op();
            return new Promise(r => {
                const tx = db.transaction(ST, 'readwrite');
                tx.objectStore(ST).clear();
                tx.oncomplete = () => r(true);
                tx.onerror    = () => r(false);
            });
        } catch { return false; }
    }

    // FIX: list all keys currently in store
    async function keys() {
        try {
            const db = await op();
            return new Promise(r => {
                const tx  = db.transaction(ST, 'readonly');
                const req = tx.objectStore(ST).getAllKeys();
                req.onsuccess = () => r(req.result || []);
                req.onerror   = () => r([]);
            });
        } catch { return []; }
    }

    return { load, save, delete: del, clear, keys };
})();
const _viewersCache = {};
let _currentFacingMode = 'user';  // для flip
let _speakerOn         = true;
const _PERM_KEY = 'wc_permissions'; // localStorage: {mic, camera, notifications}
const _sessionPerms = {};
let iceRestartTimer = null;
const GC = {
    active:     false,          // в групповом звонке
    roomId:     null,           // ID комнаты (строка)
    peers:      {},             // { userId: { pc, stream, audioEl, videoEl } }
    type:       'audio',        // audio | video
    MAX:        5,              // максимум участников
};
let _callCtrlHideTimer = null;



async function _getCachedMedia(url) {
    if (!url) return url;
    if (_mediaCache.has(url)) return _mediaCache.get(url);
    try {
        const r = await fetch(url);
        if (!r.ok) return url;
        const blob = await r.blob();
        const blobUrl = URL.createObjectURL(blob);
        _mediaCache.set(url, blobUrl);
        if (_mediaCache.size > 15) {
            const k = _mediaCache.keys().next().value;
            try { URL.revokeObjectURL(_mediaCache.get(k)); } catch(e) {}
            _mediaCache.delete(k);
        }
        return blobUrl;
    } catch(e) { return url; }

}


// Кеш профилей — не запрашиваем одно и то же дважды
const _profileCache = new Map(); // id → {data, ts}
const _PROFILE_TTL  = 5 * 60 * 1000; // 5 мин
async function _cachedProfile(userId) {
    const c = _profileCache.get(userId);
    if (c && (Date.now() - c.ts) < _PROFILE_TTL) return c.data;
    try {
        const r = await apiFetch('/get_user_profile/' + userId);
        if (!r || !r.ok) return null;
        const data = await r.json();
        _profileCache.set(userId, {data, ts: Date.now()});
        return data;
    } catch(e) { return null; }
}

// ══ КЭШ СООБЩЕНИЙ — главная фича ══
// { chatId: { messages: [], loadedAll: bool, lastFetch: timestamp } }
let messagesByChatCache = {};
const MSG_CACHE_TTL = 120000; // 2 мин — сообщения редко меняются задним числом

let longPressTimer    = null;
let _sendInFlight     = false;
let _lastSendSig      = { chatId: null, text: '', ts: 0 };
let activeTheme       = localStorage.getItem('waychat_theme') || 'emerald';
const _deletedMsgIds = new Set(
    JSON.parse(localStorage.getItem('_wc_del_ids') || '[]')
);
function _markMsgDeleted(id) {
    if (!id) return;
    _deletedMsgIds.add(String(id));
    try {
        localStorage.setItem('_wc_del_ids', JSON.stringify(Array.from(_deletedMsgIds).slice(-500)));
    } catch(e) {}
}
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


// ══ OPTIMISTIC MEDIA UI — мгновенный blob preview при отправке ═══════════
function _sendMediaOptimistic(file, chatId) {
    const blobUrl = URL.createObjectURL(file);
    const tempId  = 'tmp_' + Date.now() + '_' + Math.random().toString(36).slice(2,6);
    const isVideo = file.type.startsWith('video/');
    const isImage = file.type.startsWith('image/');
    const isAudio = file.type.startsWith('audio/');
    const msgType = isVideo ? 'video' : isImage ? 'image' : isAudio ? 'audio' : 'file';

    // Optimistic сообщение — показываем сразу с blob URL
    const optimMsg = {
        id: tempId, type: msgType, type_msg: msgType,
        file_url: blobUrl, content: file.name,
        sender_id: currentUser?.id, sender_name: currentUser?.name || '',
        timestamp: new Date().toLocaleTimeString('ru', {hour:'2-digit',minute:'2-digit'}),
        _optimistic: true, _temp_id: tempId,
    };
    if (VirtualList && VirtualList.appendMessage) VirtualList.appendMessage(optimMsg);
    else if (VirtualList && VirtualList.append) VirtualList.append(optimMsg);

    // Прогресс-индикатор
    const _setProgress = (pct) => {
        const el = document.querySelector(`[data-msg-id="${tempId}"]`);
        if (!el) return;
        let prog = el.querySelector('.wc-upld-p');
        if (!prog) {
            prog = document.createElement('div');
            prog.className = 'wc-upld-p';
            prog.style.cssText = 'position:absolute;bottom:6px;right:8px;font-size:10px;color:rgba(255,255,255,.9);background:rgba(0,0,0,.5);padding:2px 6px;border-radius:8px;z-index:5;backdrop-filter:blur(4px)';
            el.style.position = 'relative';
            el.appendChild(prog);
        }
        prog.textContent = pct < 100 ? pct + '%' : '✓';
        if (pct >= 100) setTimeout(() => prog?.remove(), 1500);
    };

    const _markFailed = () => {
        URL.revokeObjectURL(blobUrl);
        const el = document.querySelector(`[data-msg-id="${tempId}"]`);
        if (!el) return;
        el.style.opacity = '0.45';
        if (!el.querySelector('.wc-fail')) {
            const e = document.createElement('div');
            e.className = 'wc-fail';
            e.style.cssText = 'font-size:11px;color:#ef4444;margin-top:3px;cursor:pointer;padding:2px 4px';
            e.textContent = '⚠️ Ошибка — нажмите для повтора';
            e.onclick = () => { e.remove(); el.style.opacity='1'; _sendMediaOptimistic(file, chatId); };
            el.appendChild(e);
        }
    };

    const fd = new FormData();
    fd.append('file', file);
    fd.append('chat_id', chatId);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload');
    xhr.withCredentials = true;

    xhr.upload.addEventListener('progress', (e) => {
        if (!e.lengthComputable) return;
        _setProgress(Math.round(e.loaded / e.total * 100));
    });

    xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
            try {
                const resp = JSON.parse(xhr.responseText);
                if (!resp.success) { _markFailed(); return; }
                _setProgress(100);
                // Polling fallback если WS media_ready не пришёл за 8 сек
                setTimeout(() => {
                    const el = document.querySelector(`[data-msg-id="${tempId}"]`);
                    if (el && el.dataset.mediaReady !== '1' && resp.temp_id) {
                        fetch(`/api/upload_status/${resp.temp_id}`, { credentials: 'include' })
                            .then(r => r.json())
                            .then(s => { if (s.status === 'done' && s.url) _handleMediaReady({ temp_id: tempId, url: s.url }); })
                            .catch(() => {});
                    }
                }, 8000);
            } catch(e) { _markFailed(); }
        } else { _markFailed(); }
    });
    xhr.addEventListener('error', _markFailed);
    xhr.send(fd);
    return tempId;
}

function _markMsgFailed(tempId) {
    const el = document.querySelector(`[data-msg-id="${tempId}"]`);
    if (!el) return;
    el.style.opacity = '0.45';
    if (!el.querySelector('.wc-fail')) {
        const e = document.createElement('div');
        e.className = 'wc-fail';
        e.style.cssText = 'font-size:11px;color:#ef4444;margin-top:3px;';
        e.textContent = '⚠️ Ошибка отправки';
        el.appendChild(e);
    }
}

// Обработчик media_ready — обновляет blob → реальный URL
function _handleMediaReady(data) {
    const tempId = data.temp_id;
    const realUrl = data.url;
    const realMsgId = data.msg_id;
    const el = document.querySelector(`[data-msg-id="${tempId}"]`);
    if (!el) return;
    el.dataset.mediaReady = '1';
    if (realMsgId) el.setAttribute('data-msg-id', String(realMsgId));
    const img = el.querySelector('img:not([class*="rounded-full"]):not([data-uid])');
    const vid = el.querySelector('video');
    if (img && img.src && img.src.startsWith('blob:')) { URL.revokeObjectURL(img.src); img.src = realUrl; }
    if (vid && vid.src && vid.src.startsWith('blob:')) { URL.revokeObjectURL(vid.src); vid.src = realUrl; }
    el.querySelector('.wc-upld-p')?.remove();
    el.style.opacity = '1';
}

function insertEmoji() {
    const inp = document.getElementById('msg-input');
    if (!inp) return;
    const emojis = ['😊','😂','❤️','👍','🔥','🎉','😎','🥰','🫡','💯','😍','🤣'];
    const pick = emojis[Math.floor(Math.random() * emojis.length)];
    const start = inp.selectionStart || inp.value.length;
    inp.value = inp.value.slice(0, start) + pick + inp.value.slice(inp.selectionEnd || start);
    inp.setSelectionRange(start + pick.length, start + pick.length);
    inp.focus();
    updateSendButton();
    autoResize(inp);
}

// Scroll-down button — автоматически создаётся при открытии чата
function _initScrollDownBtn() {
    const msgs = document.getElementById('messages');
    if (!msgs) return;
    const existingBtn = document.getElementById('wc-sd-btn');
    if (existingBtn) {
        existingBtn.style.opacity = '0';
        existingBtn.style.display = 'none';
        return;
    }

    const btn = document.createElement('button');
    btn.id = 'wc-sd-btn';
    btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M6 9l6 6 6-6" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
    btn.style.cssText = [
        'position:absolute','bottom:72px','right:12px','z-index:50',
        'width:36px','height:36px','border-radius:50%','border:none',
        'background:rgba(40,40,42,.96)',
        'border:.5px solid rgba(255,255,255,.1)',
        'box-shadow:0 4px 16px rgba(0,0,0,.45)',
        'cursor:pointer','display:none','align-items:center','justify-content:center',
        'opacity:0','transition:opacity .2s ease',
        'backdrop-filter:blur(8px)','-webkit-backdrop-filter:blur(8px)',
    ].join(';');
    btn.onclick = () => msgs.scrollTo({ top: msgs.scrollHeight, behavior: 'smooth' });

    if (msgs.parentNode) {
        msgs.parentNode.style.position = 'relative';
        msgs.parentNode.appendChild(btn);
    }

    // Debounced scroll listener
    let _sdTimer;
    msgs.addEventListener('scroll', () => {
        clearTimeout(_sdTimer);
        _sdTimer = setTimeout(() => {
            const dist = Math.max(0, msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight);
            if (dist > 150) {
                btn.style.display = 'flex';
                requestAnimationFrame(() => { btn.style.opacity = '1'; });
            } else {
                btn.style.opacity = '0';
                setTimeout(() => { btn.style.display = 'none'; }, 200);
            }
        }, 80);
    }, { passive: true });
}

// ══════════════════════════════════════════════════════════
//  SOCKET.IO — ИНИЦИАЛИЗАЦИЯ
// ══════════════════════════════════════════════════════════

// ══ OFFLINE MESSAGE QUEUE (Task 5f) ═══════════════════════════════
// FIX: messages sent while disconnected are queued in IndexedDB
// and flushed on reconnect with ⏳ → ✓ status update

const _OMQ_STORE = 'wc_offline_queue';
let   _omqDb     = null;

function _omqOpen() {
    if (_omqDb) return Promise.resolve(_omqDb);
    return new Promise((res, rej) => {
        const req = indexedDB.open(_OMQ_STORE, 1);
        req.onupgradeneeded = e => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('queue')) {
                const store = db.createObjectStore('queue', { keyPath: 'tempId' });
                store.createIndex('ts', 'ts');
            }
        };
        req.onsuccess  = e => { _omqDb = e.target.result; res(_omqDb); };
        req.onerror    = ()  => rej(req.error);
    });
}

async function _omqAdd(item) {
    try {
        const db = await _omqOpen();
        const tx = db.transaction('queue', 'readwrite');
        tx.objectStore('queue').put(item);
        await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = rej; });
    } catch(err) { console.error('[OMQ] add failed:', err); }
}

async function _omqGetAll() {
    try {
        const db = await _omqOpen();
        return new Promise((res, rej) => {
            const tx = db.transaction('queue', 'readonly');
            const req = tx.objectStore('queue').index('ts').getAll();
            req.onsuccess = () => res(req.result || []);
            req.onerror   = () => rej(req.error);
        });
    } catch(err) { console.error('[OMQ] getAll failed:', err); return []; }
}

async function _omqDelete(tempId) {
    try {
        const db = await _omqOpen();
        const tx = db.transaction('queue', 'readwrite');
        tx.objectStore('queue').delete(tempId);
    } catch(err) { console.error('[OMQ] delete failed:', err); }
}

async function _flushOfflineQueue() {
    if (!wsConnected) return;
    const items = await _omqGetAll();
    for (const item of items) {
        try {
            socket.emit('send_message', {
                chat_id:  item.chat_id,
                content:  item.text,
                type_msg: 'text',
            });
            await _omqDelete(item.tempId);
            // Update UI: replace ⏳ with ✓
            const el = document.querySelector(`[data-msg-id="${item.tempId}"]`);
            if (el) {
                el.querySelector('.status-icon') && (
                    el.querySelector('.status-icon').innerHTML = ICONS.check
                );
                el.dataset.optimistic = '0';
            }
        } catch(err) {
            console.error('[OMQ] flush item failed:', err);
        }
    }
}

function _getLastMsgId(chatId) {
    try {
        return parseInt(localStorage.getItem(`wc_last_msg_${chatId}`) || '0', 10) || 0;
    } catch { return 0; }
}

function _setLastMsgId(chatId, msgId) {
    try { localStorage.setItem(`wc_last_msg_${chatId}`, String(msgId)); } catch {}
}

async function loadMessagesSince(chatId, afterId) {
    if (!chatId || !afterId) return;
    try {
        const r = await apiFetch(`/get_messages/${chatId}?after_id=${afterId}&limit=50`);
        if (!r || !r.ok) return;
        const msgs = await r.json();
        msgs.forEach(msg => {
            if (!document.querySelector(`[data-msg-id="${msg.id}"]`)) {
                renderNewMessage(msg, false);
            }
        });
    } catch(err) { console.error('[Reconnect] loadMessagesSince:', err); }
}
// ══ END OFFLINE QUEUE ══════════════════════════════════════════════


// ══ RINGTONE — Web Audio API synthesis (Task 4c) ══════════════════
// OPT: no external audio file — synthesized ring, < 1KB code
// Plays a repeating two-tone ring pattern

let _ringtoneCtx   = null;
let _ringtoneNodes = [];
let _ringtoneTimer = null;
let _ringtoneActive = false;

function _playRingtone() {
    if (_ringtoneActive) return;
    _ringtoneActive = true;
    try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        _ringtoneCtx = new AC();

        const playBeat = () => {
            if (!_ringtoneActive || !_ringtoneCtx) return;
            // Two-tone ring: 480Hz + 620Hz (classic PSTN ring)
            [480, 620].forEach(freq => {
                const osc  = _ringtoneCtx.createOscillator();
                const gain = _ringtoneCtx.createGain();
                osc.connect(gain);
                gain.connect(_ringtoneCtx.destination);
                osc.frequency.value = freq;
                osc.type = 'sine';
                gain.gain.setValueAtTime(0.3, _ringtoneCtx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, _ringtoneCtx.currentTime + 1.8);
                osc.start(_ringtoneCtx.currentTime);
                osc.stop(_ringtoneCtx.currentTime + 1.8);
                _ringtoneNodes.push(osc);
            });
            // Repeat every 3s (ring 2s, pause 1s)
            _ringtoneTimer = setTimeout(playBeat, 3000);
        };
        playBeat();
    } catch(err) {
        console.warn('[Ringtone] Web Audio failed:', err.message);
    }
}

function _stopRingtone() {
    _ringtoneActive = false;
    clearTimeout(_ringtoneTimer);
    _ringtoneNodes.forEach(n => { try { n.stop(); } catch {} });
    _ringtoneNodes = [];
    if (_ringtoneCtx) {
        _ringtoneCtx.close().catch(() => {});
        _ringtoneCtx = null;
    }
}
// ══ END RINGTONE ═══════════════════════════════════════════════════

function initSocket() {
    socket = io({
        path:                  '/socket.io',
        transports:            ['websocket', 'polling'],
        reconnection:          true,
        reconnectionAttempts:  Infinity,   // OPT Task 5e: never give up
        reconnectionDelay:     1000,
        reconnectionDelayMax:  10000,
        randomizationFactor:   0.5,
        timeout:               15000,      // OPT: faster failure detection
        forceNew:              false,
        withCredentials:       true,
        ackTimeout:            5000,       // OPT: 5s ACK timeout
    });

    socket.on('connect', () => {
        wsConnected = true;
        updateConnStatus(true);
        socket.emit('join', { user_id: currentUser.id });
        // Не грузим чаты если только что загрузили (< 5 сек) — избегаем тройного вызова
        if (Date.now() - _lastChatsLoad > 5000) loadChats();
    // Предзагружаем моменты сразу при старте
    setTimeout(() => loadMoments(), 800);
        if (currentChatId) socket.emit('enter_chat', { chat_id: currentChatId });
        wsReconnected = true;
    });

    socket.on('disconnect', () => { wsConnected = false; updateConnStatus(false); });
    socket.on('connect_error', () => { wsConnected = false; updateConnStatus(false); });
    socket.on('reconnect', () => {
        wsConnected = true;
        updateConnStatus(true);
        // FIX Task 5e: re-join rooms and load missed messages on reconnect
        socket.emit('join', { user_id: currentUser.id });
        if (currentChatId) {
            socket.emit('enter_chat', { chat_id: currentChatId });
            // OPT: load messages that arrived while disconnected
            var lastId = _getLastMsgId(currentChatId);
            if (lastId) loadMessagesSince(currentChatId, lastId);
        }
        // Flush offline message queue (Task 5f)
        _flushOfflineQueue();
        loadChats();
    loadMoments(); // INIT: загружаем моменты при старте
    });

    socket.on('new_message', onNewMessage);

    socket.on('is_typing', (d) => {
        if (+d.chat_id === currentChatId) showTypingIndicator(d.user_name);
    });
    socket.on('stop_typing', (d) => {
        if (+d.chat_id === currentChatId) hideTypingIndicator();
    });

    socket.on('user_status', (d) => updatePartnerOnlineStatus(+d.user_id, d.online));

    // FIX: messages_read_bulk was emitted by server but never handled
    socket.on('messages_read_bulk', (d) => {
        if (+d.chat_id === currentChatId) {
            // Update all outgoing message status icons to double-check (read)
            document.querySelectorAll('.msg-row.out .status-icon').forEach(el => {
                el.innerHTML = ICONS.checkDouble;
                el.style.color = 'rgba(147,197,253,1)';
            });
        }
    });

    socket.on('message_read', (d) => {
        document.querySelectorAll(`[data-msg-id="${d.msg_id}"] .status-icon`).forEach(el => {
            el.innerHTML = ICONS.checkDouble;
            el.style.color = 'rgba(147,197,253,1)';
        });
    });

    // BUG-B FIX: second duplicate 'messages_read_bulk' listener removed

    socket.on('message_reaction', (d) => {
        addReactionToMsg(d.msg_id, d.emoji, +d.user_id === currentUser.id);
    });

    socket.on('avatar_updated', (d) => {
        invalidateAvatarCache(d.user_id, d.avatar);
        updateAvatarInDOM(d.user_id, d.avatar);
    });

    socket.on('message_deleted', (d) => {
        _markMsgDeleted(d.msg_id);
        _animDeleteMsgRow(d.msg_id);
        // BUG-C FIX: messagesByChatCache uses 'p_id'/'g_id' keys, NOT raw chat_id
        // Scan all cache entries for this message ID and remove it
        Object.values(messagesByChatCache).forEach(entry => {
            if (entry?.messages) {
                entry.messages = entry.messages.filter(m => m.id !== d.msg_id);
            }
        });
    });

    // Группы
    socket.on('group_message', onNewMessage);
    socket.on('group_member_added', (d) => {
        if (+d.group_id === currentChatId) {
            // member added — без тоста
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
    socket.on('call_ended', () => { _stopRingtone(); endCall(false); });
    // FIX: also handle call_ended_v2 in case server sends different event
    socket.on('call_ended_v2', () => { _stopRingtone(); endCall(false); });
    // FIX Task 4d: recipient declined call from push notification
    socket.on('call_declined', (data) => {
        _stopRingtone();
        const lbl = document.getElementById('call-status-label');
        if (lbl) lbl.textContent = 'Звонок отклонён';
        showToast('Звонок отклонён', 'info');
        setTimeout(() => endCall(false), 1800);
    });

    // ── Групповые звонки ──
    socket.on('gc_user_joined',  onGroupCallJoin);
    socket.on('gc_offer',        data => onGCOffer(data));
    socket.on('gc_answer',       data => onGCAnswer(data));
    socket.on('gc_ice',          data => onGCIce(data));
    socket.on('gc_user_left',    onGroupCallLeave);
    socket.on('gc_invite', data => {
        vibrate([200,100,200]);
        const name = data.from_name || 'Пользователь';
        const typeLabel = data.call_type === 'video' ? 'видеозвонок' : 'звонок';
        showToast(`📞 ${name} приглашает в групповой ${typeLabel}`, 'info', 8000);
        _showGCInviteBanner(data);
    });

    // ── Новый момент ──
    socket.on('new_moment', (d) => {
        onNewMomentSocket(d);
    });

    // v9.0: async upload events
    socket.on('media_ready', _handleMediaReady);

    // ── chat_deleted: удаляем переписку у ОБОИХ участников ──
    socket.on('chat_deleted', async function(d) {
        const cid = d && d.chat_id;
        if (!cid) return;

        // Находим чат ДО любых изменений
        const chat      = recentChats.find(ch => ch.chat_id === cid);
        const partnerId = chat?.partner_id || null;
        const groupId   = chat?.group_id   || null;
        const ck1 = partnerId ? `p_${partnerId}` : null;
        const ck2 = groupId   ? `g_${groupId}`   : null;

        // Помечаем удалёнными
        _deletedChatIds.add(cid);
        _persistDeletedChatIds();
        if (partnerId) { _deletedPartnerIds.add(partnerId); _persistDeletedPartnerIds(); }

        // Чистим ВСЕ кэши
        if (ck1) delete messagesByChatCache[ck1];
        if (ck2) delete messagesByChatCache[ck2];
        const tasks = [];
        if (ck1) tasks.push(MsgDB.delete(ck1));
        if (ck2) tasks.push(MsgDB.delete(ck2));
        tasks.push(WCCache.del('chats', String(cid)));
        if (partnerId) tasks.push(WCCache.del('profiles', String(partnerId)));
        await Promise.allSettled(tasks);

        // Чистим localStorage
        try {
            const ls = JSON.parse(localStorage.getItem('waychat_chats_cache') || '[]');
            localStorage.setItem('waychat_chats_cache',
                JSON.stringify(ls.filter(ch => ch.chat_id !== cid)));
        } catch(e) {}
        recentChats = recentChats.filter(ch => ch.chat_id !== cid);

        // Убираем из DOM
        if (chat) {
            const key = chat.is_group ? ck2 : ck1;
            const el = key && document.querySelector(`[data-chat-key="${key}"]`);
            if (el) el.remove();
        }

        // Закрываем чат если открыт
        if (currentChatId === cid) {
            document.getElementById('chat-window')?.classList.remove('active');
            document.getElementById('main-content')?.classList.remove('chat-depth');
            const fab = document.getElementById('fab-btn-el');
            if (fab) fab.style.display = '';
            currentChatId = null;
            currentPartnerId = null;
            // Показываем пустой экран
            const msgs = document.getElementById('messages');
            if (msgs) msgs.innerHTML = '';
        }
    });
    socket.on('media_upload_error', (data) => {
        const el = document.querySelector(`[data-msg-id="${data.temp_id}"]`);
        if (!el) return;
        el.style.opacity = '0.45';
        if (!el.querySelector('.wc-fail')) {
            const f = document.createElement('div');
            f.className = 'wc-fail';
            f.style.cssText = 'font-size:11px;color:#ef4444;margin-top:3px';
            f.textContent = '⚠️ Ошибка загрузки файла';
            el.appendChild(f);
        }
    });
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
    // ── 1. Профиль из кэша — мгновенно ──
    try {
        const cache = localStorage.getItem('waychat_user_cache') || localStorage.getItem('varto_user_cache');
        if (cache) Object.assign(currentUser, JSON.parse(cache));
    } catch(e){}

    applyTheme(activeTheme);
    renderApp();
    applyTheme(activeTheme);
    updateAllAvatarUI();
    setupGlobalGestures();

    // ── 2. INSTANT: чаты из localStorage — рендерим ДО fetch (нет сети — уже виден список) ──
    try {
        const cachedChats = localStorage.getItem('waychat_chats_cache');
        if (cachedChats) {
            const parsed = JSON.parse(cachedChats);
            if (Array.isArray(parsed) && parsed.length > 0) {
                // КРИТИЧНО: фильтруем удалённые чаты ДО рендера
                const filtered = parsed.filter(ch => !_deletedChatIds.has(ch.chat_id));
                recentChats = filtered;
                renderChatList(filtered);
                // Обновляем кэш без удалённых чатов
                if (filtered.length !== parsed.length) {
                    try { localStorage.setItem('waychat_chats_cache', JSON.stringify(filtered)); } catch(e) {}
                }
            }
        }
    } catch(e) {}

    // ── 3. Socket + реальные данные в фоне ──

    // ═══ iOS UNIVERSAL COMPATIBILITY (iPhone 6→17 Pro Max) ═══
    (function() {
        // Отключаем bounce scroll на iOS (убирает серую область при перетягивании)
        document.addEventListener('touchmove', function(e) {
            if (e.target === document.body || e.target === document.documentElement) {
                e.preventDefault();
            }
        }, { passive: false });

        // Фикс для standalone PWA — убираем статус-бар просвет
        var meta = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
        if (meta) meta.content = 'black';

        // Инжектим глобальный CSS для убийства серой полосы на всех iPhone
        var killGray = document.createElement('style');
        killGray.textContent = [
            'html,body{background:#1d1d1e!important;margin:0!important;padding:0!important}',
            '#app{position:fixed!important;inset:0!important;background:#1d1d1e!important}',
            // Убираем outline и border у всех input на iOS
            'input,textarea{-webkit-appearance:none!important;appearance:none!important;border-radius:0}',
            // Запрещаем выделение текста везде кроме полей ввода
            '*:not(input):not(textarea){-webkit-user-select:none;user-select:none}',
            'input,textarea{-webkit-user-select:text!important;user-select:text!important}',
            // Фикс для viewport на iPhone с notch
            '@supports(padding-top:env(safe-area-inset-top)){',
            '.chat-view{top:0!important}',
            '}',
        ].join('');
        document.head.appendChild(killGray);

        // Viewport height fix — только для resize событий (клавиатура)
        var lastH = 0;
        function onVV() {
            var vv = window.visualViewport;
            if (!vv) return;
            var h = vv.height;
            if (Math.abs(h - lastH) < 2) return;
            lastH = h;
            document.documentElement.style.setProperty('--app-height', h + 'px');
            // НЕ меняем высоту #app — он position:fixed inset:0
        }
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', onVV, { passive: true });
        }
    })();

    initSocket();
    // Fallback 1: если socket не подключится за 2с — грузим чаты напрямую
    setTimeout(() => {
        if (!wsConnected && Date.now() - _lastChatsLoad > 1500) loadChats(true);
    }, 2000);
    // Fallback 2: повторная попытка через 5с на случай медленного соединения
    setTimeout(() => {
        if (Date.now() - _lastChatsLoad > 4000) loadChats(true);
    }, 5000);
    setTimeout(syncProfileData, 500);
    setTimeout(_updatePermsSummary, 1000);
    setTimeout(initPushNotifications, 800);
    // БАГ 5: Если запустили как PWA — сразу запрашиваем уведомления
    const _isPWA = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    if (_isPWA && 'Notification' in window && Notification.permission === 'default') {
        setTimeout(() => {
            Notification.requestPermission().then(p => {
                if (p === 'granted') initPushNotifications();
            });
        }, 1500); // небольшая задержка чтобы UI загрузился
    }

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            const now = Date.now();
            if (now - _lastChatsLoad > 30000) loadChats();
            if (currentTab === 'moments' && now - momentsLastLoad > 60000) loadMoments();
        }
    });
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
    // null как строка "null" или объект null — оба заменяем пустой строкой
    const avatar = (!user.avatar || user.avatar === 'null' || user.avatar === 'undefined') ? '' : user.avatar;
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
        html = `<img src="${src}" class="${sizeClass} rounded-full object-cover shadow-md border border-white/10" style="border-radius:50%;object-fit:cover" loading="lazy" data-uid="${user.id||''}" onerror="this.outerHTML=getInitialAvatar('${name.replace(/'/g,"\\'")}','${sizeClass}','${user.id||''}')">`;
    } else {
        html = getInitialAvatar(name, sizeClass, user.id);
    }
    avatarHtmlCache[cacheKey] = html;
    return html;
}

function getInitialAvatar(name, sizeClass, uid = '') {
    const colors = ['#f43f5e','#6366f1','#10b981','#f59e0b','#3b82f6','#8b5cf6','#ec4899','#06b6d4'];
    const n = name || '?';
    let hash = 0;
    for (let i = 0; i < n.length; i++) hash = n.charCodeAt(i) + ((hash << 5) - hash);
    const color = colors[Math.abs(hash) % colors.length];
    const char  = n.charAt(0).toUpperCase();
    // FIXED: адаптивный font-size — минимум 14px (было 20px дефолт — слишком мелко)
    const sc = sizeClass || '';
    const fs = sc.includes('w-28') ? '46px'
        : sc.includes('w-20') ? '36px'
        : sc.includes('w-16') ? '28px'
        : sc.includes('w-14') ? '24px'
        : sc.includes('w-12') ? '20px'
        : sc.includes('w-11') ? '18px'
        : sc.includes('w-10') ? '17px'
        : sc.includes('w-9')  ? '16px'
        : sc.includes('w-8')  ? '14px'   // минимум 14px
        : sc.includes('full') ? '42%'    // w-full — процент от контейнера
        : '14px';                         // FIXED: дефолт 14px (было 20px)
    return `<div class="${sc} rounded-full" style="background:${color};font-size:${fs};font-weight:700;color:#fff;letter-spacing:-0.5px;line-height:1;display:flex;align-items:center;justify-content:center;flex-shrink:0" data-uid="${uid}">${char}</div>`;
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

function getChatPreviewTime(dateStr) {
    if (!dateStr) return '';
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return '';
        const msk = 3 * 60;
        const loc = d.getTimezoneOffset();
        const moscow = new Date(d.getTime() + (msk + loc) * 60000);
        const now    = new Date(Date.now() + (msk + (new Date().getTimezoneOffset())) * 60000);
        const hh = moscow.getHours().toString().padStart(2,'0');
        const mm = moscow.getMinutes().toString().padStart(2,'0');
        // Today → HH:MM
        if (moscow.toDateString() === now.toDateString()) return `${hh}:${mm}`;
        // Yesterday → Вчера
        const yest = new Date(now); yest.setDate(yest.getDate()-1);
        if (moscow.toDateString() === yest.toDateString()) return 'Вчера';
        // This week (< 7 days) → day name
        const diff = Math.floor((now - moscow) / 86400000);
        if (diff < 7) {
            const days = ['Вс','Пн','Вт','Ср','Чт','Пт','Сб'];
            return days[moscow.getDay()];
        }
        // Older → date
        const months = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];
        return `${moscow.getDate()} ${months[moscow.getMonth()]}`;
    } catch(e) { return ''; }
}

function getMoscowTime(dateStr) {
    if (!dateStr) return '';
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;

        const moscowOffset = 3 * 60;
        const localOffset  = d.getTimezoneOffset();
        const moscow = new Date(d.getTime() + (moscowOffset + localOffset) * 60000);
        const nowMsk = new Date(Date.now() + (moscowOffset + (new Date().getTimezoneOffset())) * 60000);

        const mDate = moscow.toDateString();
        const nDate = nowMsk.toDateString();

        // Сегодня — только время
        if (mDate === nDate) {
            return moscow.getHours().toString().padStart(2,'0') + ':' + moscow.getMinutes().toString().padStart(2,'0');
        }

        // Вчера
        const yesterday = new Date(nowMsk);
        yesterday.setDate(yesterday.getDate() - 1);
        if (mDate === yesterday.toDateString()) return 'Вчера';

        // Эта неделя (до 7 дней) — название дня
        const diffDays = Math.floor((nowMsk - moscow) / 86400000);
        if (diffDays < 7) {
            const days = ['Вс','Пн','Вт','Ср','Чт','Пт','Сб'];
            return days[moscow.getDay()];
        }

        // Этот год — день + месяц по-русски (без года)
        const months = ['янв','фев','мар','апр','мая','июн','июл','авг','сен','окт','ноя','дек'];
        if (moscow.getFullYear() === nowMsk.getFullYear()) {
            return moscow.getDate() + ' ' + months[moscow.getMonth()];
        }

        // Старше года — день.месяц.год
        return moscow.getDate() + ' ' + months[moscow.getMonth()] + ' ' + moscow.getFullYear();
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
    --bg: #1d1d1e;
    --bg2: #191919;
    --surface: #2a2a2b;
    --surface2: #242424;
    --border: rgba(255,255,255,0.06);
    --text: #ffffff;
    --text-2: rgba(255,255,255,0.45);
    --msg-in: #2a2a2b;
    --msg-out: #1a7a52;
    --divider: rgba(255,255,255,0.05);
    --chat-bg: #1d1d1e;
    --hdr: rgba(29,29,30,0.97);
    --sep: rgba(255,255,255,0.07);
    --item-hover: rgba(255,255,255,0.05);
}
* { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
html, body {
    height: 100%;
    overflow: hidden;
    margin: 0;
    /* FIXED: position:fixed убран — ломал scroll на Android Chrome.
       overflow:hidden достаточно для предотвращения резинового скролла. */
    width: 100%;
    -webkit-text-size-adjust: 100%;
    -webkit-font-smoothing: antialiased;
}
body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: var(--bg); color: var(--text);
}
.glass { background:var(--hdr);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px); }
.glass-card { background:rgba(255,255,255,0.04);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border:1px solid var(--border); }

/* НАВ-БАР */
/* FAB — прибит к самому низу экрана */
.fab-btn{
    position:fixed;
    bottom:16px;
    right:14px;
    width:46px;height:46px;
    border-radius:50%;
    background:#10b981;
    border:none;cursor:pointer;
    display:flex;align-items:center;justify-content:center;
    box-shadow:0 1px 6px rgba(0,0,0,.3);
    z-index:900;
    transition:transform .15s ease;
    -webkit-tap-highlight-color:transparent;
}
.fab-btn:active{transform:scale(.88)}
.fab-menu{
    position:fixed;
    bottom:68px;
    right:12px;z-index:901;
    display:flex;flex-direction:column;gap:8px;align-items:flex-end;
    pointer-events:none;opacity:0;
    transform:translateY(8px) scale(.97);
    transition:opacity .18s ease,transform .18s cubic-bezier(.34,1.56,.64,1)
}
.fab-menu.open{pointer-events:all;opacity:1;transform:translateY(0) scale(1)}
.fab-mi{display:flex;align-items:center;gap:14px;background:rgba(40,40,42,0.98);border:.5px solid rgba(255,255,255,.1);border-radius:16px;padding:14px 18px;cursor:pointer;box-shadow:0 8px 32px rgba(0,0,0,.6);font-size:15px;font-weight:500;color:rgba(255,255,255,.9);white-space:nowrap;-webkit-tap-highlight-color:transparent;transition:background .12s;backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px)}
.fab-mi:active{background:rgba(60,60,62,0.98)}
.fab-mi-ico{width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,.1);display:flex;align-items:center;justify-content:center;flex-shrink:0}
.fab-bd{position:fixed;inset:0;z-index:899;background:rgba(0,0,0,.45);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);opacity:0;pointer-events:none;transition:opacity .2s ease}
.fab-bd.open{opacity:1;pointer-events:all}
.hdr-badge{display:inline-flex;align-items:center;justify-content:center;background:var(--accent);color:#000;font-size:10px;font-weight:800;min-width:18px;height:18px;border-radius:9px;padding:0 5px;margin-left:6px}
.prof-sheet-wrap{position:fixed;inset:0;z-index:8500;display:none;align-items:flex-end}
.prof-sheet-inner{position:relative;width:100%;max-height:92dvh;overflow-y:auto;-webkit-overflow-scrolling:touch;background:#1c1c1c;border-radius:22px 22px 0 0;border-top:.5px solid rgba(255,255,255,.08);transform:translateY(100%);transition:transform .35s cubic-bezier(.32,.72,0,1);padding-bottom:20px}

/* ПОИСК — пилл как у TG */
.search-box { display:flex;align-items:center;gap:8px;background:#2c2c2e;border:none !important;outline:none !important;border-radius:9999px;padding:8px 14px;box-shadow:none !important;-webkit-appearance:none; }
.search-box:focus-within { background:#363638; }
.search-box * { border:none !important; outline:none !important; box-shadow:none !important; }
#chat-search-bar { border:none !important; border-bottom:none !important; box-shadow:none !important; outline:none !important; background:var(--bg,#1d1d1e) !important; }
#search-box-wrap { border:none !important; outline:none !important; box-shadow:none !important; }

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

/* ЧАТЫ — TG минимализм */
.chat-item{display:flex;align-items:center;gap:12px;padding:7px 16px;cursor:pointer;position:relative;transition:background .15s;will-change:transform}
.chat-item:active{background:var(--item-hover)}
.chat-item-divider{display:none}
/* TG-style divider: тонкая линия снизу, начинается после аватара */
.chat-item + .chat-item { border-top: 0.33px solid rgba(255,255,255,0.07); }
.online-dot{position:absolute;bottom:1px;right:1px;width:12px;height:12px;background:var(--accent);border:2px solid var(--bg);border-radius:50%;box-shadow:0 0 6px var(--accent)}

/* СВАЙП ЖЕСТЫ */
.chat-swipe-container{position:relative;overflow:hidden;touch-action:pan-y}
.chat-swipe-action{position:absolute;top:0;bottom:0;display:flex;align-items:center;justify-content:center;min-width:72px;pointer-events:none;opacity:0;transition:opacity .15s}
.chat-swipe-action.right{left:0;background:linear-gradient(90deg,rgba(16,185,129,0.25),transparent);padding-left:18px;justify-content:flex-start}
.chat-swipe-action.left{right:0;background:linear-gradient(270deg,rgba(99,102,241,0.25),transparent);padding-right:18px;justify-content:flex-end}

/* MOMENTS BAR */
.moment-ava-item{display:flex;flex-direction:column;align-items:center;gap:5px;cursor:pointer;flex-shrink:0;-webkit-tap-highlight-color:transparent;transition:opacity .15s}
.moment-ava-item:active{opacity:0.65}
#moments-bar-scroll::-webkit-scrollbar{display:none}
#moments-bar-scroll{scrollbar-width:none}

/* АНИМАЦИИ МИКРОВЗАИМОДЕЙСТВИЙ — плавные и медленные */
@keyframes chatRiseUp{
    0%   { opacity:0; transform:translateY(8px); }
    100% { opacity:1; transform:translateY(0); }
}
/* staggered delay по индексу через nth-child */
.chat-item-animate{
    animation:chatRiseUp 0.45s cubic-bezier(0.16,1,0.3,1) both;
    animation-fill-mode: both;
}
@keyframes avaPulse{0%,100%{transform:scale(1)}40%{transform:scale(1.08)}70%{transform:scale(0.98)}}
.ava-pulse-anim{animation:avaPulse 0.4s cubic-bezier(0.34,1.56,0.64,1)}

/* ЧАТ ОКНО — плавное открытие как в TG */
.chat-view { position:fixed;inset:0;z-index:2000;background:var(--chat-bg);display:flex;flex-direction:column;overflow:hidden;transform:translateX(100%);transition:transform 0.28s cubic-bezier(0.25,0.46,0.45,0.94);will-change:transform; }
.chat-view.active { transform:translateX(0); }
.chat-wallpaper{
    background-color: #1a1a2e;
    background-image:
        radial-gradient(ellipse at 20% 50%, rgba(16,185,129,0.04) 0%, transparent 50%),
        radial-gradient(ellipse at 80% 20%, rgba(99,102,241,0.04) 0%, transparent 50%),
        url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.018'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E");
}
/* Эффект глубины на фоне при открытии чата */
#main-content{transition:transform 0.28s cubic-bezier(0.25,0.46,0.45,0.94),filter 0.28s ease,opacity 0.28s ease}
#main-content.chat-depth{transform:scale(0.96);filter:blur(2px);opacity:0.6;pointer-events:none}

/* СООБЩЕНИЯ */
.msg-container { display:flex;flex-direction:column;gap:2px;padding:4px 8px 4px;scroll-behavior:auto;will-change:scroll-position;justify-content:flex-end;min-height:100%; }
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

/* ИНПУТ — floating над чатом (position:absolute задан в wc-ios10 патче) */
.input-bar { padding:8px 12px;border:none !important;background:transparent;backdrop-filter:none;-webkit-backdrop-filter:none; }
.input-wrap { display:flex;align-items:flex-end;gap:8px; }
.input-inner { flex:1;display:flex;align-items:center;background:#2c2c2e;border:none;border-radius:22px;padding:4px 4px 4px 14px;min-height:44px; }
.input-inner:focus-within { background:#333335; }
#msg-input { flex:1;background:transparent;outline:none;color:white;font-size:16px;padding:6px 4px;resize:none;max-height:120px;line-height:1.4;font-family:inherit;-webkit-appearance:none; }
#msg-input::placeholder { color:rgba(255,255,255,0.35); }
.send-btn { width:44px;height:44px;border-radius:50%;background:var(--accent);display:flex;align-items:center;justify-content:center;border:none;cursor:pointer;flex-shrink:0;transition:transform 0.15s,box-shadow 0.15s;box-shadow:var(--glow); }
.send-btn:active { transform:scale(0.88); }
.icon-btn { width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,0.06);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:background 0.15s; }
.icon-btn:active { background:rgba(255,255,255,0.14); }

/* ── v9.0: ВРЕМЯ INLINE как в Telegram ── */
.msg-time { display:none !important; }
.bubble { padding:8px 12px 6px !important; position:relative; }
.msg-row { margin-bottom:1px !important; }
.msg-meta-inline { display:inline-flex;align-items:center;gap:2px;font-size:10.5px;opacity:0.6;white-space:nowrap;pointer-events:none;line-height:1; }
.msg-media-time { position:absolute;bottom:6px;right:8px;background:rgba(0,0,0,0.48);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);border-radius:8px;padding:2px 6px;font-size:10px;color:rgba(255,255,255,0.9);display:flex;align-items:center;gap:3px;z-index:2;pointer-events:none; }

/* ── v9.0: TELEGRAM INPUT BAR ── */
/* FIX INPUT BAR: raise above home indicator, proper height */
.tg-input-row { display:flex;align-items:flex-end;gap:6px;background:rgba(28,28,30,0.88);backdrop-filter:blur(20px) saturate(180%);-webkit-backdrop-filter:blur(20px) saturate(180%);border-radius:26px;padding:6px 8px;box-shadow:0 4px 24px rgba(0,0,0,0.35),0 1px 0 rgba(255,255,255,0.05) inset;margin:0 4px; }
.tg-attach-btn { width:42px;height:42px;border-radius:50%;background:transparent;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;color:rgba(255,255,255,0.5);transition:color 0.15s;-webkit-tap-highlight-color:transparent; }
.tg-attach-btn:active { color:white;background:rgba(255,255,255,0.08); }
.tg-text-wrap { flex:1;display:flex;align-items:flex-end;background:#2c2c2e;border:none !important;outline:none !important;box-shadow:none !important;border-radius:22px;padding:6px 6px 6px 14px;min-height:44px; }
.tg-text-wrap:focus-within { background:#333335; }
.tg-inner-btn { width:32px;height:32px;border-radius:50%;background:transparent;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;color:rgba(255,255,255,0.45);align-self:flex-end;margin-bottom:3px;-webkit-tap-highlight-color:transparent; }
.tg-inner-btn:active { color:white; }
.tg-send-btn { width:42px;height:42px;border-radius:50%;background:var(--accent);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:var(--glow);transition:transform 0.15s;-webkit-tap-highlight-color:transparent; }
.tg-send-btn:active { transform:scale(0.88); }
.tg-mic-btn { background:transparent !important;box-shadow:none !important;color:rgba(255,255,255,0.6); }
.tg-mic-btn:active { color:white; }

/* ── v9.0: FULLSCREEN PHOTO ── */
#wc-img-viewer { position:fixed;inset:0;z-index:99000;background:rgba(0,0,0,0.96);display:flex;align-items:center;justify-content:center;opacity:0;pointer-events:none;transition:opacity 0.22s ease; }
#wc-img-viewer.open { opacity:1;pointer-events:all; }
#wc-img-viewer img { max-width:100vw;max-height:100vh;object-fit:contain;user-select:none;-webkit-user-select:none;touch-action:pinch-zoom; }
#wc-img-viewer-close { position:absolute;top:max(env(safe-area-inset-top,0px),12px);right:16px;width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,0.12);backdrop-filter:blur(8px);border:0.5px solid rgba(255,255,255,0.2);color:white;cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:10;-webkit-tap-highlight-color:transparent; }
#wc-img-viewer-close:active { background:rgba(255,255,255,0.22); }
.img-bubble { border-radius:18px !important;overflow:hidden !important;border:none !important;outline:none !important;box-shadow:none !important;background:transparent !important; }
.img-bubble img { display:block;width:100%;height:auto;max-height:380px;object-fit:cover;border:none !important;outline:none !important;box-shadow:none !important; }
/* FIX GREEN BORDER: image/video bubbles must have zero padding and transparent background */
.bubble:has(.img-bubble) { padding:0 !important;background:transparent !important;border:none !important;box-shadow:none !important; }
.bubble:has(video) { padding:0 !important;background:transparent !important;border:none !important;box-shadow:none !important; }
.msg-row.out .bubble:has(.img-bubble) { background:transparent !important;box-shadow:none !important; }
.msg-row.in  .bubble:has(.img-bubble) { background:transparent !important;border:none !important;box-shadow:none !important; }
.wc-img-sk { position:absolute;inset:0;border-radius:inherit;background:rgba(255,255,255,0.07);animation:wcSkPulse 1.5s ease-in-out infinite;pointer-events:none; }

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
.wave-bar { width:3px;background:var(--accent);border-radius:2px;min-height:4px;height:4px; }
.wave-bar:nth-child(odd) { animation-delay:0.1s; }
.wave-bar:nth-child(3n) { animation-delay:0.2s; }
@keyframes wave { 0%,100%{height:4px;} 50%{height:20px;} }
.record-ui .wave-bar { animation:wave 0.8s ease infinite; }

/* ЗВОНОК */
.call-screen { position:fixed;inset:0;z-index:99999;background:linear-gradient(160deg,#080810 0%,#0d0d18 100%);overflow:hidden;transition:opacity 0.3s; }
.hidden { display:none !important; }
.call-screen.hidden { display:none; }
.call-bg { position:absolute;inset:0;z-index:0;opacity:0.15;filter:blur(60px);background:radial-gradient(circle at 50% 30%,var(--accent) 0%,transparent 60%);animation:callBgPulse 3s ease infinite; }
@keyframes callBgPulse { 0%,100%{opacity:0.1;} 50%{opacity:0.25;} }
.call-ring-1,.call-ring-2,.call-ring-3 { position:absolute;top:50%;left:50%;border-radius:50%;border:1px solid var(--accent);opacity:0;animation:ring 3s ease-out infinite;transform:translate(-50%,-50%); }
.call-ring-1 { width:180px;height:180px;animation-delay:0s; }
.call-ring-2 { width:240px;height:240px;animation-delay:0.6s; }
.call-ring-3 { width:300px;height:300px;animation-delay:1.2s; }
@keyframes ring { 0%{opacity:0.6;transform:translate(-50%,-50%) scale(0.8);} 100%{opacity:0;transform:translate(-50%,-50%) scale(1.2);} }
.call-info { position:absolute;top:0;left:0;right:0;bottom:0;z-index:1;display:flex;flex-direction:column;align-items:center;justify-content:center; }
/* Кнопки управления звонком — авто-скрытие */
#call-controls { opacity:1;transform:translateY(0);transition:opacity 0.4s ease,transform 0.4s ease; }
.call-btns { position:relative;z-index:1;display:flex;gap:20px;align-items:center;flex-wrap:wrap;justify-content:center;margin-top:auto;margin-bottom:60px;width:100%; }
.call-btn { width:64px;height:64px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:none;cursor:pointer;transition:transform 0.15s,box-shadow 0.15s;-webkit-tap-highlight-color:transparent; }
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
.img-bubble { border-radius:16px;overflow:hidden;max-width:260px;cursor:zoom-in;border:none !important;outline:none !important;box-shadow:none !important;background:transparent !important; }
.img-bubble img { display:block;width:100%;border:none !important;outline:none !important; }

/* МОДАЛЬНЫЕ */
.modal-overlay { position:fixed;inset:0;z-index:8000;background:rgba(0,0,0,0.7);backdrop-filter:blur(10px);display:flex;align-items:flex-end;animation:fadeIn 0.2s ease; }
.modal-sheet { background:rgba(18,18,25,0.98);backdrop-filter:blur(40px);border-radius:28px 28px 0 0;border-top:0.5px solid var(--border);width:100%;padding:16px 20px;padding-bottom:24px;animation:slideUp 0.3s cubic-bezier(0.22,1,0.36,1); }
.modal-handle { width:36px;height:4px;background:rgba(255,255,255,0.2);border-radius:2px;margin:0 auto 20px; }

/* АУДИО ПЛЕЕР */
.audio-player { display:flex;align-items:center;gap:10px;min-width:190px;padding:4px 0; }
.audio-play-btn { width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,0.2);border:none;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;transition:background 0.15s,transform 0.1s;flex-shrink:0; }
.audio-play-btn:active { transform:scale(0.88); }
.audio-progress-wrap { flex:1;display:flex;flex-direction:column;gap:3px; }
.audio-progress-bar { height:3px;background:rgba(255,255,255,0.2);border-radius:2px;overflow:hidden;cursor:pointer;position:relative; }
.audio-progress-fill { height:100%;background:rgba(255,255,255,0.8);border-radius:2px;width:0;transition:width 0.1s linear; }
.w-full { width: 100%; }
.h-full { height: 100%; }
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
.partner-profile-overlay { position:fixed;inset:0;z-index:5500;background:#0f0f0f;display:flex;flex-direction:column;overflow-y:auto;animation:slideUp 0.28s cubic-bezier(.4,0,.2,1); }
@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}} @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}} @keyframes slideUp { from{transform:translateY(100%);} to{transform:translateY(0);} } @keyframes shimmer{0%{background-position:-400px 0}100%{background-position:400px 0}} .skeleton-shimmer{background:linear-gradient(90deg,rgba(255,255,255,0.04) 0%,rgba(255,255,255,0.09) 50%,rgba(255,255,255,0.04) 100%);background-size:400px 100%;animation:shimmer 1.6s infinite linear}

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
@keyframes msgIn { from{opacity:0;transform:translateY(6px);} to{opacity:1;transform:translateY(0);} }
@keyframes toastIn { from{opacity:0;transform:translateY(-8px) scale(0.96);} to{opacity:1;transform:translateY(0) scale(1);} }
@keyframes toastOut { to{opacity:0;transform:translateY(-8px) scale(0.96);} }
.animate-msg { animation:msgIn 0.18s ease-out both; }
.animate-up  { animation:slideUp 0.3s ease; }

/* ════════════════════════════════════════════════════════
   DESKTOP LAYOUT — компактный двухколоночный (≥768px)
   Левая колонка: список чатов | Правая: открытый чат
   ════════════════════════════════════════════════════════ */
@media (min-width: 768px) {

    /* ══ TELEGRAM-STYLE DESKTOP LAYOUT ══ */

    body { cursor: default; }

    /* #app — горизонтальный flex как в Telegram */
    #app {
        flex-direction: row !important;
        overflow: hidden !important;
    }

    /* ── Левая колонка: список чатов ── */
    #main-content {
        width: 340px !important;
        min-width: 280px !important;
        max-width: 380px !important;
        flex: 0 0 340px !important;
        height: 100% !important;
        overflow-y: auto !important;
        overflow-x: hidden !important;
        padding-bottom: 0 !important;
        border-right: 1px solid rgba(255,255,255,0.06) !important;
        background: var(--bg, #1d1d1e) !important;
    }

    /* ── Правая колонка: окно чата ── */
    /* КЛЮЧЕВОЕ: на десктопе .chat-view НЕ position:fixed */
    .chat-view {
        position: relative !important;
        flex: 1 1 0% !important;
        min-width: 0 !important;
        height: 100% !important;
        transform: none !important;
        transition: none !important;
        border-radius: 0 !important;
        display: flex !important;
        flex-direction: column !important;
        overflow: hidden !important;
    }

    /* На десктопе чат всегда виден (не translateX(100%)) */
    .chat-view { transform: none !important; }
    .chat-view.active { transform: none !important; }

    /* Пустое состояние — пока чат не выбран */
    #chat-window:not(.active) {
        background: var(--bg, #1d1d1e) !important;
        transform: none !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
    }
    #chat-window:not(.active) > *:not(#chat-empty-state) {
        display: none !important;
    }
    #chat-window:not(.active) #chat-empty-state {
        display: flex !important;
    }

    /* Убираем эффект глубины на desktop */
    #main-content.chat-depth {
        transform: none !important;
        filter: none !important;
        opacity: 1 !important;
        pointer-events: all !important;
    }

    /* Кнопка назад — скрываем на десктопе */
    #chat-back-btn { display: none !important; }

    /* FAB — скрываем на десктопе */
    .fab-btn { display: none !important; }
    .fab-bd  { display: none !important; }
    .fab-menu { display: none !important; }

    /* Чаты: компактнее + hover */
    .chat-item {
        padding: 8px 16px !important;
        transition: background .1s !important;
        cursor: pointer !important;
    }
    .chat-item:hover { background: rgba(255,255,255,0.05) !important; }

    /* Бабблы чуть уже */
    .bubble { max-width: 62% !important; }
    .msg-row.out .bubble { margin-left: 80px !important; }
    .msg-row.in  .bubble { margin-right: 80px !important; }

    /* Шапка чата */
    #chat-header {
        padding-top: 10px !important;
    }

    /* FIX P2: на десктопе input-bar тоже floating, padding стандартный */
    .input-bar { padding-bottom: 10px !important; padding-top: 8px !important; }
    #messages { padding-bottom: 76px !important; }

    /* Скроллбары */
    #main-content::-webkit-scrollbar { width: 5px; }
    #main-content::-webkit-scrollbar-track { background: transparent; }
    #main-content::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 3px; }
    #main-content::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }

    #messages::-webkit-scrollbar { width: 5px; }
    #messages::-webkit-scrollbar-track { background: transparent; }
    #messages::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 3px; }

    /* Hover на кнопках */
    button:hover { opacity: 0.82; }
    .icon-btn:hover { background: rgba(255,255,255,0.09) !important; }

    /* Курсор */
    .chat-item, button, [onclick] { cursor: pointer; }

    /* Моменты-бар на десктопе чуть компактнее */
    #moments-bar-scroll { gap: 10px; }

    /* Поиск в шапке */
    #chat-search-bar { padding: 10px 16px 8px; }

    /* Safe-area top — на десктопе 0 */
    #chat-search-bar {
        padding-top: 14px !important;
    }
}

/* ══ 1100px+ : широкий экран ══ */
@media (min-width: 1100px) {
    #main-content {
        width: 380px !important;
        max-width: 420px !important;
    }
    .bubble { max-width: 58% !important; }
}

/* ══ 1400px+ : очень широкий ══ */
@media (min-width: 1400px) {
    #main-content {
        width: 420px !important;
        max-width: 460px !important;
    }
}

/* Очень широкие экраны */
@media (min-width: 1100px) {
    #main-content {
        width: 360px !important;
        max-width: 400px !important;
    }
}

/* DESKTOP OVERRIDE: chat-view НЕ fixed на широких экранах */
@media (min-width: 768px) {
    .chat-view {
        position: relative !important;
        inset: auto !important;
        height: 100% !important;
        flex: 1 1 0% !important;
        transform: none !important;
    }
}
</style>

<div id="app" style="position:fixed;inset:0;display:flex;flex-direction:column;overflow:hidden;background:var(--bg,#1d1d1e)">
    <div id="conn-status" class="conn-status" style="opacity:0"></div>
    <div id="main-content" class="flex-1 overflow-y-auto" style="overflow-x:hidden;padding-bottom:0">

        <!-- ══ ЧАТЫ ══ -->
        <div id="chats-section">
            <!-- Единая строка: поиск + аватар — sticky, всегда сверху при скролле -->
            <div id="chat-search-bar" style="display:flex;align-items:center;gap:10px;padding:10px 12px 8px;position:sticky;top:0;z-index:100;background:var(--bg,#1d1d1e);border:none;box-shadow:none;outline:none">
                <!-- Поиск -->
                <div class="search-box" id="search-box-wrap" style="flex:1">
                    <span style="flex-shrink:0;opacity:.4">${ICONS.search}</span>
                    <input id="search-input" style="background:transparent;outline:none;width:100%;color:var(--text);font-size:16px;font-family:inherit"
                           placeholder="Поиск"
                           oninput="handleSearch()" onfocus="onSearchFocus()" onblur="onSearchBlur()">
                    <button id="search-cancel" onclick="cancelSearch()" style="display:none;color:var(--accent);font-size:14px;font-weight:600;border:none;background:none;cursor:pointer;white-space:nowrap;flex-shrink:0;font-family:inherit">Отмена</button>
                </div>
                <!-- Аватар профиля — справа от поиска -->
                <button onclick="openProfileSheet()" style="background:none;border:none;cursor:pointer;padding:0;border-radius:50%;overflow:hidden;flex-shrink:0;-webkit-tap-highlight-color:transparent;width:36px;height:36px">
                    <div id="hdr-ava" style="width:36px;height:36px;border-radius:50%;overflow:hidden">${getAvatarHtml(currentUser,'w-9 h-9')}</div>
                </button>
            </div>
            <!-- badge скрытый — нужен для updateUnreadBadge() -->
            <div id="total-unread-badge" style="display:none">0</div>
            <!-- Moments-панель (появляется свайпом вниз) -->
            <div id="moments-bar" style="display:none;overflow:hidden;max-height:0;transition:max-height 0.3s cubic-bezier(0.22,1,0.36,1),opacity 0.25s ease;opacity:0">
                <div style="padding:8px 12px 4px">
                    <div id="moments-bar-scroll" style="display:flex;gap:14px;overflow-x:auto;padding-bottom:8px;scrollbar-width:none;-webkit-overflow-scrolling:touch"></div>
                </div>
            </div>
            <div id="search-results" style="padding:0 8px;display:none"></div>
            <div id="chat-list"></div>
        </div>

                <div id='moments-section' style='display:none'><div id='full-moments-list'></div></div>

                <!-- ══ МУЗЫКА (modal overlay, открывается из профиля) ══ -->
        <div id="music-section" style="display:none;position:fixed;inset:0;z-index:9200;background:#0a0a0e;overflow-y:auto;-webkit-overflow-scrolling:touch">
            <!-- Header -->
            <div style="position:sticky;top:0;z-index:10;background:rgba(10,10,14,.92);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border-bottom:.5px solid rgba(255,255,255,.07);padding:max(env(safe-area-inset-top),44px) 16px 12px">
                <div style="display:flex;align-items:center;gap:12px">
                    <button onclick="closeMusicPlayer()" style="width:32px;height:32px;border-radius:50%;background:rgba(255,255,255,.08);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;-webkit-tap-highlight-color:transparent">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M19 12H5M12 5l-7 7 7 7" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    </button>
                    <div style="flex:1">
                        <h2 style="font-size:20px;font-weight:800;letter-spacing:-.3px;margin:0">Музыка</h2>
                        <div id="music-track-count" style="font-size:12px;color:rgba(255,255,255,.35);margin-top:1px">0 треков</div>
                    </div>
                    <button onclick="musicPickFiles()" title="Добавить музыку" style="width:40px;height:40px;background:var(--accent);border:none;border-radius:50%;cursor:pointer;font-family:inherit;-webkit-tap-highlight-color:transparent;flex-shrink:0;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 16px rgba(16,185,129,.4);transition:transform .1s" onpointerdown="this.style.transform='scale(.9)'" onpointerup="this.style.transform=''">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><line x1="12" y1="5" x2="12" y2="19" stroke="black" stroke-width="2.5" stroke-linecap="round"/><line x1="5" y1="12" x2="19" y2="12" stroke="black" stroke-width="2.5" stroke-linecap="round"/></svg>
                    </button>
                </div>
                <!-- Поиск -->
                <div style="margin-top:10px;display:flex;align-items:center;gap:10px;background:rgba(255,255,255,.06);border-radius:14px;padding:10px 14px">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style="flex-shrink:0;opacity:.35"><circle cx="11" cy="11" r="8" stroke="white" stroke-width="2"/><path d="m21 21-4.35-4.35" stroke="white" stroke-width="2" stroke-linecap="round"/></svg>
                    <input id="music-search-input" style="background:none;outline:none;width:100%;color:white;font-size:15px;font-family:inherit" placeholder="Поиск треков..." oninput="musicSearch(this.value)">
                </div>
            </div>

            <!-- Плеер — большая карточка -->
            <div id="music-player-card" style="display:none;margin:16px 16px 0">
                <!-- Обложка + визуализатор -->
                <div style="position:relative;width:100%;padding-bottom:56%;border-radius:24px;overflow:hidden;background:rgba(255,255,255,.05);margin-bottom:16px">
                    <div id="mpc-cover-bg" style="position:absolute;inset:0;background:linear-gradient(135deg,#1a1a2e,#16213e);transition:background .5s"></div>
                    <img id="mpc-cover-img" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:none;opacity:.7" src="" alt="">
                    <canvas id="music-viz-canvas" style="position:absolute;inset:0;width:100%;height:100%"></canvas>
                    <!-- Overlay с именем -->
                    <div style="position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,.8) 0%,transparent 60%);display:flex;flex-direction:column;justify-content:flex-end;padding:20px">
                        <div id="mpc-title" style="font-size:20px;font-weight:900;letter-spacing:-.3px;text-shadow:0 2px 12px rgba(0,0,0,.5)">—</div>
                        <div id="mpc-artist" style="font-size:14px;color:rgba(255,255,255,.55);margin-top:4px">—</div>
                    </div>
                    <!-- Бейдж источника скрыт -->
                    <div id="mpc-source-badge" style="display:none"></div>
                </div>

                <!-- Прогресс -->
                <div style="padding:0 4px;margin-bottom:12px">
                    <div id="mpc-prog-wrap" style="height:28px;display:flex;align-items:center;cursor:pointer;position:relative;margin-bottom:2px;touch-action:none"
                         onclick="musicSeek(event,this)"
                         ontouchstart="_mpSeekStart(event,this)" ontouchmove="_mpSeekMove(event,this)" ontouchend="_mpSeekEnd(event,this)">
                        <div style="width:100%;height:4px;background:rgba(255,255,255,.12);border-radius:4px;position:relative;overflow:visible">
                            <div id="mpc-prog-bar" style="height:100%;background:var(--accent);border-radius:4px;width:0%;pointer-events:none;transition:width .3s linear;position:relative">
                                <div style="position:absolute;right:-5px;top:-4px;width:12px;height:12px;background:white;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>
                            </div>
                        </div>
                    </div>
                    <div style="display:flex;justify-content:space-between">
                        <span id="mpc-cur" style="font-size:11px;color:rgba(255,255,255,.35)">0:00</span>
                        <span id="mpc-dur" style="font-size:11px;color:rgba(255,255,255,.35)">0:00</span>
                    </div>
                </div>

                <!-- Кнопки управления -->
                <div style="display:flex;align-items:center;justify-content:space-between;padding:0 8px;margin-bottom:20px">
                    <button onclick="musicToggleShuffle()" id="mpc-shuffle-btn" style="width:44px;height:44px;border-radius:50%;background:rgba(255,255,255,.07);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,.4);-webkit-tap-highlight-color:transparent;transition:all .2s">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><polyline points="16 3 21 3 21 8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><line x1="4" y1="20" x2="21" y2="3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><polyline points="21 16 21 21 16 21" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><line x1="15" y1="15" x2="21" y2="21" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                    </button>
                    <button onclick="musicPrev()" style="width:52px;height:52px;border-radius:50%;background:rgba(255,255,255,.08);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;color:white;-webkit-tap-highlight-color:transparent">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><polygon points="19 20 9 12 19 4 19 20" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><line x1="5" y1="19" x2="5" y2="5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                    </button>
                    <button id="mpc-play-btn" onclick="musicTogglePlay()" style="width:66px;height:66px;border-radius:50%;background:var(--accent);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 24px rgba(16,185,129,.45);-webkit-tap-highlight-color:transparent;transition:transform .1s" onpointerdown="this.style.transform='scale(.94)'" onpointerup="this.style.transform=''">
                        <svg id="mpc-play-ico" width="24" height="24" viewBox="0 0 24 24" fill="none"><polygon points="5 3 19 12 5 21 5 3" fill="black"/></svg>
                    </button>
                    <button onclick="musicNext()" style="width:52px;height:52px;border-radius:50%;background:rgba(255,255,255,.08);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;color:white;-webkit-tap-highlight-color:transparent">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><polygon points="5 4 15 12 5 20 5 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><line x1="19" y1="5" x2="19" y2="19" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                    </button>
                    <button onclick="musicToggleRepeat()" id="mpc-repeat-btn" style="width:44px;height:44px;border-radius:50%;background:rgba(255,255,255,.07);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,.4);-webkit-tap-highlight-color:transparent;transition:all .2s">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><polyline points="17 1 21 5 17 9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 11V9a4 4 0 014-4h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><polyline points="7 23 3 19 7 15" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M21 13v2a4 4 0 01-4 4H3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                    </button>
                </div>

                <!-- EQ кнопка — маленькая, показывает/скрывает секцию -->
                <div style="display:flex;justify-content:center;padding-bottom:16px">
                    <button id="mpc-eq-btn" onclick="musicShowEQ()" style="display:flex;align-items:center;gap:6px;padding:7px 16px;background:rgba(255,255,255,.06);border:.5px solid rgba(255,255,255,.1);border-radius:20px;color:rgba(255,255,255,.4);font-size:12px;font-weight:700;letter-spacing:.5px;cursor:pointer;font-family:inherit;-webkit-tap-highlight-color:transparent;transition:all .2s">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><line x1="4" y1="6" x2="20" y2="6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="4" y1="12" x2="20" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="4" y1="18" x2="20" y2="18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="8" cy="6" r="2" fill="currentColor"/><circle cx="16" cy="12" r="2" fill="currentColor"/><circle cx="10" cy="18" r="2" fill="currentColor"/></svg>
                        EQ
                    </button>
                </div>
            </div>

            <!-- Эквалайзер — скрыт, открывается по кнопке EQ -->
            <div id="music-eq-section" style="display:none;margin:16px 16px 0;background:rgba(20,20,28,.95);border:.5px solid rgba(255,255,255,.07);border-radius:22px;overflow:hidden">
                <!-- Заголовок -->
                <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 18px 12px">
                    <span style="font-size:13px;font-weight:800;letter-spacing:.8px;color:rgba(255,255,255,.5)">ЭКВАЛАЙЗЕР</span>
                    <div style="display:flex;gap:8px;align-items:center">
                        <span id="eq-toggle-label" style="font-size:11px;font-weight:700;color:rgba(255,255,255,.3)">ВЫКЛ</span>
                        <div id="eq-toggle-switch" onclick="musicToggleEQ()" style="width:44px;height:26px;border-radius:13px;background:rgba(255,255,255,.1);cursor:pointer;position:relative;transition:background .25s;-webkit-tap-highlight-color:transparent">
                            <div id="eq-toggle-thumb" style="width:22px;height:22px;border-radius:50%;background:white;position:absolute;top:2px;left:2px;transition:transform .25s;box-shadow:0 2px 6px rgba(0,0,0,.5)"></div>
                        </div>
                    </div>
                </div>
                <!-- Пресеты -->
                <div id="eq-presets-row" style="display:flex;gap:6px;flex-wrap:wrap;padding:0 18px 14px"></div>
                <!-- Canvas EQ — перетаскиваемые точки с кривой -->
                <div style="position:relative;margin:0 12px;border-radius:14px;overflow:hidden;background:rgba(0,0,0,.4)">
                    <canvas id="eq-canvas" style="width:100%;height:200px;display:block;touch-action:none"></canvas>
                </div>
                <!-- Частоты -->
                <div style="display:flex;justify-content:space-around;padding:8px 18px 4px">
                    ${['32','64','125','250','500','1k','2k','4k','8k','16k'].map(f=>`<span style="font-size:9px;color:rgba(255,255,255,.2);text-align:center;flex:1">${f}</span>`).join('')}
                </div>
                <!-- Кнопки -->
                <div style="display:flex;gap:8px;padding:10px 18px 16px">
                    <button onclick="musicResetEQ()" style="flex:1;padding:11px;background:rgba(255,255,255,.05);border:.5px solid rgba(255,255,255,.08);border-radius:12px;color:rgba(255,255,255,.4);font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">Сбросить</button>
                    <button onclick="musicDisableEQ()" style="flex:1;padding:11px;background:rgba(255,255,255,.05);border:.5px solid rgba(255,255,255,.08);border-radius:12px;color:rgba(255,255,255,.4);font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">Выключить</button>
                </div>
            </div>

            <!-- Список треков -->
            <div style="margin:16px 16px 0">
                <div style="font-size:12px;font-weight:800;letter-spacing:.6px;color:rgba(255,255,255,.3);margin-bottom:10px">ТРЕКИ</div>
                <div id="music-track-list" style="padding-bottom:32px"></div>
            </div>

            <!-- Пустое состояние -->
            <div id="music-empty-state" style="padding:80px 0;text-align:center">
                <div style="width:80px;height:80px;border-radius:50%;background:rgba(255,255,255,.05);display:flex;align-items:center;justify-content:center;margin:0 auto 20px">
                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none"><path d="M9 18V5l12-2v13" stroke="rgba(255,255,255,.3)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="6" cy="18" r="3" stroke="rgba(255,255,255,.3)" stroke-width="1.5"/><circle cx="18" cy="16" r="3" stroke="rgba(255,255,255,.3)" stroke-width="1.5"/></svg>
                </div>
                <p style="font-size:18px;font-weight:800;margin-bottom:8px">Нет треков</p>
                <p style="font-size:14px;color:rgba(255,255,255,.35);line-height:1.5">Добавь MP3, AAC, FLAC или WAV<br>Можно загрузить видео — аудио<br>извлечётся автоматически</p>
            </div>
        </div>

        <!-- ══ НАСТРОЙКИ ══ -->
        <!-- settings moved to profile sheet -->
    </div>


    <!-- ══ FAB ПЛЮС ══ -->
    <div id="fab-bd" class="fab-bd" onclick="closeFabMenu()"></div>
    <div id="fab-menu" class="fab-menu">
        <div class="fab-mi" onclick="closeFabMenu();openNewContactModal()">
            <div class="fab-mi-ico">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" stroke="rgba(255,255,255,.75)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="7" r="4" stroke="rgba(255,255,255,.75)" stroke-width="2"/><line x1="19" y1="8" x2="19" y2="14" stroke="rgba(255,255,255,.75)" stroke-width="2" stroke-linecap="round"/><line x1="16" y1="11" x2="22" y2="11" stroke="rgba(255,255,255,.75)" stroke-width="2" stroke-linecap="round"/></svg>
            </div>
            <span>Новый чат</span>
        </div>
        <div class="fab-mi" onclick="closeFabMenu();openCreateGroupModal()">
            <div class="fab-mi-ico">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" stroke="rgba(255,255,255,.75)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="9" cy="7" r="4" stroke="rgba(255,255,255,.75)" stroke-width="2"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" stroke="rgba(255,255,255,.75)" stroke-width="2" stroke-linecap="round"/></svg>
            </div>
            <span>Новая группа</span>
        </div>
        <div class="fab-mi" onclick="closeFabMenu();pickMedia('moment')">
            <div class="fab-mi-ico">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,.75)" stroke-width="2"/><circle cx="12" cy="12" r="4" stroke="rgba(255,255,255,.75)" stroke-width="2"/><line x1="12" y1="2" x2="12" y2="4" stroke="rgba(255,255,255,.75)" stroke-width="2" stroke-linecap="round"/><line x1="12" y1="20" x2="12" y2="22" stroke="rgba(255,255,255,.75)" stroke-width="2" stroke-linecap="round"/><line x1="2" y1="12" x2="4" y2="12" stroke="rgba(255,255,255,.75)" stroke-width="2" stroke-linecap="round"/><line x1="20" y1="12" x2="22" y2="12" stroke="rgba(255,255,255,.75)" stroke-width="2" stroke-linecap="round"/></svg>
            </div>
            <span>Создать момент</span>
        </div>
    </div>
    <button class="fab-btn" onclick="toggleFabMenu()" id="fab-btn-el" aria-label="Новый чат">
        <svg id="fab-ico" width="20" height="20" viewBox="0 0 24 24" fill="none" style="transition:transform .25s cubic-bezier(0.34,1.56,0.64,1)">
            <line x1="12" y1="5" x2="12" y2="19" stroke="white" stroke-width="2.5" stroke-linecap="round"/>
            <line x1="5" y1="12" x2="19" y2="12" stroke="white" stroke-width="2.5" stroke-linecap="round"/>
        </svg>
    </button>

</div>

<!-- ══ PROFILE SHEET ══ -->
<div id="prof-sheet" class="prof-sheet-wrap">
    <div onclick="closeProfileSheet()" style="position:absolute;inset:0;background:rgba(0,0,0,.55);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)"></div>
    <div class="prof-sheet-inner" id="prof-sheet-inner">
        <div style="padding:10px 16px 2px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;background:#1c1c1c;z-index:2;border-radius:22px 22px 0 0">
            <div style="width:36px;height:4px;border-radius:2px;background:rgba(255,255,255,.2);margin:0 auto"></div>
            <button onclick="closeProfileSheet()" style="position:absolute;right:14px;top:10px;width:30px;height:30px;border-radius:50%;background:rgba(255,255,255,0.1);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,0.6);-webkit-tap-highlight-color:transparent">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/><line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>
            </button>
        </div>
        <div id="settings-section">
            <!-- iOS 26 hero: размытый фон из аватара -->
            <div style="position:relative;height:300px;overflow:hidden;flex-shrink:0">
                <div id="settings-bg" style="position:absolute;inset:-40px;background-size:cover;background-position:center;filter:blur(30px) brightness(0.45) saturate(1.7);transition:background-image 0.4s"></div>
                <div style="position:absolute;inset:0;background:linear-gradient(to bottom,rgba(0,0,0,0.05) 0%,rgba(0,0,0,0) 40%,rgba(17,17,17,1) 100%)"></div>
                <!-- Аватар по центру внизу -->
                <div style="position:absolute;bottom:0;left:0;right:0;display:flex;flex-direction:column;align-items:center;padding-bottom:20px;z-index:2">
                    <div style="position:relative;margin-bottom:14px">
                        <div id="settings-ava-box" style="width:96px;height:96px;border-radius:50%;overflow:hidden;border:3.5px solid rgba(255,255,255,0.22);box-shadow:0 8px 40px rgba(0,0,0,0.6)">
                            ${getAvatarHtml(currentUser, 'w-full h-full')}
                        </div>
                        <div style="position:absolute;bottom:-2px;left:50%;transform:translateX(-50%);display:flex;gap:8px">
                            <button onclick="changeAvatar()" style="width:32px;height:32px;background:rgba(0,0,0,0.65);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,0.2);border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;color:white">${ICONS.camera}</button>
                            <button onclick="setEmojiAvatar()" style="width:32px;height:32px;background:rgba(0,0,0,0.65);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,0.2);border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;color:white">${ICONS.smile}</button>
                        </div>
                    </div>
                    <h2 id="settings-name" style="font-size:24px;font-weight:800;letter-spacing:-0.4px;text-shadow:0 2px 12px rgba(0,0,0,0.5);margin:0">${currentUser.name}</h2>
                    <p style="color:rgba(255,255,255,0.5);font-size:14px;margin:4px 0 0">@${currentUser.username}</p>
                </div>
            </div>
            <div style="padding:0 16px 100px;background:#111">
                <div style="margin-bottom:8px;margin-top:14px">
                    <p style="font-size:11px;font-weight:700;color:rgba(255,255,255,0.35);letter-spacing:0.8px;text-transform:uppercase;margin:0 4px 8px">Профиль</p>
                    <div style="background:rgba(255,255,255,0.05);border-radius:18px;overflow:hidden">
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
</div>

<!-- ══ МИНИ-ПЛЕЕР (глобальный, поверх всего) ══ -->
<div id="music-mini-player" style="display:none;position:fixed;bottom:20px;left:12px;right:12px;z-index:6500;border-radius:18px;overflow:hidden;background:rgba(15,15,20,0.96);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);border:.5px solid rgba(255,255,255,.1);box-shadow:0 8px 40px rgba(0,0,0,.7);transform:translateY(120%);transition:transform .4s cubic-bezier(.32,.72,0,1)">
    <!-- Прогресс бар сверху -->
    <div style="height:2.5px;background:rgba(255,255,255,.08);position:relative">
        <div id="mmp-prog" style="height:100%;background:var(--accent);width:0%;transition:width .5s linear;border-radius:0 2px 2px 0"></div>
    </div>
    <div style="display:flex;align-items:center;gap:10px;padding:10px 14px">
        <!-- Обложка -->
        <div id="mmp-cover" onclick="openMusicPlayer()" style="width:40px;height:40px;border-radius:10px;flex-shrink:0;overflow:hidden;background:rgba(255,255,255,.06);display:flex;align-items:center;justify-content:center;cursor:pointer;position:relative">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style="opacity:.4"><path d="M9 18V5l12-2v13" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="6" cy="18" r="3" stroke="white" stroke-width="2"/><circle cx="18" cy="16" r="3" stroke="white" stroke-width="2"/></svg>
        </div>
        <!-- Инфо (кликабельно — открывает плеер) -->
        <div onclick="openMusicPlayer()" style="flex:1;min-width:0;cursor:pointer">
            <div id="mmp-title" style="font-size:14px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:white;line-height:1.2">—</div>
            <div id="mmp-artist" style="font-size:12px;color:rgba(255,255,255,.45);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"></div>
        </div>
        <!-- Кнопки управления -->
        <div style="display:flex;align-items:center;gap:2px;flex-shrink:0">
            <button onclick="musicPrev()" style="width:38px;height:38px;border-radius:50%;background:transparent;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,.7);-webkit-tap-highlight-color:transparent" onpointerdown="this.style.background='rgba(255,255,255,.1)'" onpointerup="this.style.background='transparent'" onpointerleave="this.style.background='transparent'">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><polygon points="19 20 9 12 19 4 19 20" fill="currentColor"/><line x1="5" y1="19" x2="5" y2="5" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>
            </button>
            <button id="mmp-play-btn" onclick="musicTogglePlay()" style="width:44px;height:44px;border-radius:50%;background:var(--accent);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;-webkit-tap-highlight-color:transparent;transition:transform .1s;flex-shrink:0" onpointerdown="this.style.transform='scale(.9)'" onpointerup="this.style.transform=''" onpointerleave="this.style.transform=''">
                <svg id="mmp-play-ico" width="18" height="18" viewBox="0 0 24 24" fill="none"><polygon points="5 3 19 12 5 21 5 3" fill="black"/></svg>
            </button>
            <button onclick="musicNext()" style="width:38px;height:38px;border-radius:50%;background:transparent;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,.7);-webkit-tap-highlight-color:transparent" onpointerdown="this.style.background='rgba(255,255,255,.1)'" onpointerup="this.style.background='transparent'" onpointerleave="this.style.background='transparent'">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><polygon points="5 4 15 12 5 20 5 4" fill="currentColor"/><line x1="19" y1="5" x2="19" y2="19" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>
            </button>
            <button onclick="_mpCloseMiniPlayer()" style="width:32px;height:32px;border-radius:50%;background:transparent;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,.3);-webkit-tap-highlight-color:transparent;margin-left:2px" onpointerdown="this.style.color='rgba(255,255,255,.7)'" onpointerup="this.style.color='rgba(255,255,255,.3)'" onpointerleave="this.style.color='rgba(255,255,255,.3)'">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>
            </button>
        </div>
    </div>
</div>

<!-- ══ ЧАТ ОКНО ══ -->
<div id="chat-window" class="chat-view">
    <!-- Пустой экран для десктопа — показывается когда чат не выбран -->
    <div id="chat-empty-state" style="display:none;flex-direction:column;align-items:center;justify-content:center;gap:16px;height:100%;opacity:0.25;pointer-events:none;user-select:none">
        <svg width="72" height="72" viewBox="0 0 24 24" fill="none"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke="white" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <div style="font-size:18px;font-weight:600;color:#fff">Выберите чат</div>
        <div style="font-size:14px;color:rgba(255,255,255,0.5)">Начните общение</div>
    </div>
    <div id="chat-header" class="glass" style="padding:10px 14px;padding-top:max(env(safe-area-inset-top,0px),10px);display:flex;align-items:center;justify-content:space-between;border-bottom:0.5px solid var(--border);position:relative;z-index:5;background:var(--hdr);flex-shrink:0">
        <div style="display:flex;align-items:center;gap:10px">
            <button onclick="closeChat()" class="icon-btn" style="position:relative">
                ${ICONS.back}
                <span id="chat-back-badge" style="display:none;position:absolute;top:-3px;right:-5px;min-width:16px;height:16px;background:#f59e0b;color:#000;font-size:9px;font-weight:800;border-radius:8px;padding:0 3px;align-items:center;justify-content:center;line-height:16px;pointer-events:none"></span>
            </button>
            <div style="position:relative;cursor:pointer" onclick="showPartnerProfile()">
                <div id="chat-ava-header" style="width:40px;height:40px;border-radius:50%;overflow:hidden;flex-shrink:0;"></div>
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
        </div>
    </div>
    <div id="messages" class="flex-1 chat-wallpaper msg-container"></div>
    <div id="typing-wrap" class="typing-wrap glass" style="padding:6px 16px 8px;border-top:0.5px solid var(--border)">
        <div class="typing-bubble">
            <div class="dot"></div><div class="dot"></div><div class="dot"></div>
        </div>
        <div style="font-size:11px;color:var(--text-2);margin-bottom:4px" id="typing-name-label"></div>
    </div>
    <div class="input-bar" style="border-top:none">
        <div class="tg-input-row">
            <button class="tg-attach-btn" onclick="pickMedia('msg')" aria-label="Прикрепить">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
            <div class="tg-text-wrap" id="input-area">
                <textarea id="msg-input" rows="1"
                    placeholder="Сообщение..."
                    oninput="handleTyping(); autoResize(this); updateSendButton()"
                    onkeydown="handleInputKeydown(event)"></textarea>
                <button class="tg-inner-btn" onclick="insertEmoji()" aria-label="Эмодзи">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/><path d="M8 14s1.5 2 4 2 4-2 4-2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="9" cy="9" r="1" fill="currentColor"/><circle cx="15" cy="9" r="1" fill="currentColor"/></svg>
                </button>
            </div>
            <button id="send-btn-main" onclick="sendText()" class="tg-send-btn" style="display:none" aria-label="Отправить">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M22 2L11 13M22 2L15 22L11 13L2 9L22 2Z" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
            <button id="voice-btn-main" class="tg-send-btn tg-mic-btn" aria-label="Голосовое" style="touch-action:none;user-select:none;-webkit-user-select:none">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="9" y="2" width="6" height="12" rx="3" stroke="currentColor" stroke-width="2"/><path d="M5 10a7 7 0 0014 0" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M12 19v3M9 22h6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
            </button>
        </div>
    </div>
</div>

<!-- ══ ЗВОНОК iOS 26 ══ -->
<div id="call-screen" class="call-screen hidden" onclick="showCallControls()">
    <!-- Размытый фон -->
    <div class="call-bg" id="call-bg-blur"></div>

    <!-- Видео-контейнеры -->
    <div id="call-video-container" class="video-container" style="display:none">
        <video id="remote-video" autoplay playsinline style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover"></video>
        <video id="local-video"  autoplay playsinline muted style="position:absolute;bottom:120px;right:16px;width:100px;height:140px;border-radius:16px;object-fit:cover;z-index:20;border:2px solid rgba(255,255,255,0.3);box-shadow:0 4px 20px rgba(0,0,0,0.4)"></video>
    </div>

    <!-- Pulse rings (1:1 звонок) -->
    <div class="call-ring-1" id="call-rings-container"></div>
    <div class="call-ring-2"></div><div class="call-ring-3"></div>

    <!-- GRID участников группового звонка -->
    <div id="group-call-grid" style="
        display:none;
        position:absolute;inset:0;
        padding:max(env(safe-area-inset-top),52px) 12px 200px;
        display:none;
        grid-template-columns:1fr 1fr;
        gap:10px;
        overflow-y:auto;
        align-content:start;
    "></div>

    <!-- Основная инфо (1:1) -->
    <div class="call-info" id="call-info" style="pointer-events:none">
        <div id="call-avatar-box" style="margin-bottom:16px"></div>
        <h2 id="call-name" style="font-size:28px;font-weight:800;letter-spacing:-0.5px;z-index:1;text-shadow:0 2px 20px rgba(0,0,0,0.6)">...</h2>
        <div id="call-status-label" style="color:rgba(255,255,255,0.7);font-size:15px;margin-top:8px;z-index:1;font-weight:500">Вызов...</div>
        <div id="call-timer" class="call-timer" style="margin-top:10px;display:none;font-size:22px;font-weight:700;color:white;font-variant-numeric:tabular-nums">0:00</div>
        <div id="call-quality-label" style="display:none;font-size:11px;color:rgba(255,255,255,0.4);margin-top:4px"></div>
    </div>

    <!-- Кнопки управления (авто-скрываются через 3с) -->
    <div id="call-controls" style="
        position:absolute;bottom:0;left:0;right:0;
        padding:20px 20px max(20px,36px);
        background:linear-gradient(transparent,rgba(0,0,0,0.7));
        transition:opacity 0.4s ease, transform 0.4s ease;
        z-index:50;
    ">
        <!-- Кнопка + добавить участника -->
        <div id="add-participant-row" style="display:flex;justify-content:center;margin-bottom:18px;opacity:0;pointer-events:none;transition:opacity 0.3s">
            <button onclick="openAddParticipant();event.stopPropagation()" style="
                display:flex;align-items:center;gap:8px;
                padding:10px 22px;
                background:rgba(255,255,255,0.15);
                backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);
                border:1px solid rgba(255,255,255,0.25);
                border-radius:24px;color:#fff;font-size:14px;font-weight:700;
                cursor:pointer;font-family:inherit;
            ">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" fill="white"/>
                    <circle cx="20" cy="8" r="4" fill="var(--accent,#10b981)"/>
                    <path d="M20 6v4M18 8h4" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
                Добавить участника
            </button>
        </div>

        <!-- Основные кнопки -->
        <div style="display:flex;gap:14px;align-items:center;justify-content:center;margin-bottom:14px">
            <button id="accept-btn" onclick="answerIncomingCall();event.stopPropagation()" class="call-btn accept" style="display:none">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="white"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/></svg>
            </button>
            <button id="mute-btn" onclick="toggleMute();event.stopPropagation()" class="call-btn neutral" style="color:white" title="Микрофон">${ICONS.mic.replace('rgba(255,255,255,0.5)','white')}</button>
            <button onclick="endCall(true);event.stopPropagation()" class="call-btn danger" title="Завершить">${ICONS.phone_off}</button>
            <button id="video-btn" onclick="toggleVideo();event.stopPropagation()" class="call-btn neutral" style="color:white" title="Камера">${ICONS.video.replace('white','white')}</button>
            <button id="speaker-btn" onclick="toggleSpeaker();event.stopPropagation()" class="call-btn neutral" style="color:white" title="Динамик">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M15.54 8.46a5 5 0 010 7.07" stroke="white" stroke-width="2" stroke-linecap="round"/></svg>
            </button>
        </div>
        <div style="display:flex;gap:12px;justify-content:center">
            <button id="flip-btn" onclick="flipCamera();event.stopPropagation()" class="call-btn neutral" style="width:44px;height:44px;color:white;opacity:0.7">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M1 4v6h6M23 20v-6h-6" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M20.49 9A9 9 0 005.64 5.64L1 10M23 14l-4.64 4.36A9 9 0 013.51 15" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
        </div>
    </div>
</div>

<!-- Portal root для модалок (всегда поверх всего) -->
<div id="portal-root" style="position:fixed;inset:0;z-index:89000;pointer-events:none"></div>

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

// ══ FAB + PROFILE SHEET ══════════════════════════════════════
let _fo = false;
function toggleFabMenu(){_fo?closeFabMenu():openFabMenu();}
function openFabMenu(){
    // Не открываем меню если чат открыт
    const chatWin=document.getElementById('chat-window');
    if(chatWin?.classList.contains('active'))return;
    _fo=true;
    document.getElementById('fab-menu')?.classList.add('open');
    document.getElementById('fab-bd')?.classList.add('open');
    const i=document.getElementById('fab-ico');
    if(i)i.style.transform='rotate(45deg)';
    vibrate(8);
}
function closeFabMenu(){
    _fo=false;
    document.getElementById('fab-menu')?.classList.remove('open');
    document.getElementById('fab-bd')?.classList.remove('open');
    const i=document.getElementById('fab-ico');
    if(i)i.style.transform='rotate(0deg)';
}
function openProfileSheet(){
    const sh=document.getElementById('prof-sheet');
    const inn=document.getElementById('prof-sheet-inner');
    if(!sh||!inn)return;
    updateSettingsUI();
    setTimeout(_injectMusicButton,80);
    sh.style.display='flex';
    inn.style.transition='none';
    inn.style.transform='translateY(100%)';
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
        inn.style.transition='transform .35s cubic-bezier(.32,.72,0,1)';
        inn.style.transform='translateY(0)';
    }));
    vibrate(8);
    // Свайп вниз для закрытия
    _setupProfileSwipeClose(inn);
}

function _setupProfileSwipeClose(inn){
    // Не вешаем повторно
    if(inn._swipeSetup)return;
    inn._swipeSetup=true;
    let sy=0,dragging=false,startScrollTop=0;
    inn.addEventListener('touchstart',e=>{
        sy=e.touches[0].clientY;
        startScrollTop=inn.scrollTop;
        dragging=true;
    },{passive:true});
    inn.addEventListener('touchmove',e=>{
        if(!dragging)return;
        const dy=e.touches[0].clientY-sy;
        // Закрываем только если скролл в самом верху и тянем вниз
        if(dy>0&&inn.scrollTop<=0){
            inn.style.transition='none';
            inn.style.transform=`translateY(${Math.min(dy*0.55,220)}px)`;
        }
    },{passive:true});
    inn.addEventListener('touchend',e=>{
        if(!dragging)return;
        dragging=false;
        const dy=e.changedTouches[0].clientY-sy;
        if(dy>90&&inn.scrollTop<=0){
            closeProfileSheet();
        } else {
            inn.style.transition='transform .25s cubic-bezier(.32,.72,0,1)';
            inn.style.transform='translateY(0)';
        }
    },{passive:true});
}
function closeProfileSheet(){
    const inn=document.getElementById('prof-sheet-inner');
    const sh=document.getElementById('prof-sheet');
    if(!inn||!sh)return;
    inn.style.transition='transform .32s cubic-bezier(.32,.72,0,1)';
    inn.style.transform='translateY(100%)';
    setTimeout(()=>{
        sh.style.display='none';
        inn.style.transition='';
    },340);
}
// Обновляем аватар в шапке при смене
function _syncHeaderAva(){
    const b=document.getElementById('hdr-ava');
    if(b)b.innerHTML=getAvatarHtml(currentUser,'w-9 h-9');
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
let _lastChatsLoad = 0;
let _chatsLoading = false;

let _loadChatsRetryCount = 0;

async function loadChats(force = false) {
    const now = Date.now();
    // FIXED: таймаут защита — если _chatsLoading завис более 12 сек, сбрасываем
    if (_chatsLoading && (now - _lastChatsLoad) < 12000) return;
    if (_chatsLoading) { _chatsLoading = false; } // сброс зависшего флага
    if (!force && recentChats.length && (now - _lastChatsLoad) < 8000) {
        renderChatList(recentChats);
        return;
    }
    _chatsLoading = true;

    // FIXED: мгновенный рендер из localStorage пока грузится сервер
    if (!recentChats.length) {
        try {
            const cached = localStorage.getItem('waychat_chats_cache');
            if (cached) {
                const parsed = JSON.parse(cached);
                if (Array.isArray(parsed) && parsed.length) {
                    recentChats = parsed;
                    renderChatList(parsed.filter(ch => !_deletedChatIds.has(ch.chat_id)));
                } else { showChatSkeleton(); }
            } else { showChatSkeleton(); }
        } catch(e) { showChatSkeleton(); }
    }

    const controller = new AbortController();
    // FIXED: таймаут уменьшен до 8 сек + принудительный сброс флага
    const tid = setTimeout(() => {
        controller.abort();
        _chatsLoading = false;
        if (!recentChats.length) _showChatsError();
        _scheduleChatsRetry();
    }, 8000);

    try {
        const res = await fetch('/get_my_chats', {
            credentials: 'include',
            headers: {'Accept-Encoding': 'gzip, deflate'},
            signal: controller.signal
        });
        clearTimeout(tid);
        if (!res || !res.ok) {
            _chatsLoading = false;
            if (!recentChats.length) _showChatsError();
            _scheduleChatsRetry();
            return;
        }
        let chats = await res.json();
        chats = chats.filter(ch => !_deletedChatIds.has(ch.chat_id));
        recentChats = chats;
        _lastChatsLoad = Date.now();
        _loadChatsRetryCount = 0;
        renderChatList(chats);
        updatePageTitle();
        try { localStorage.setItem('waychat_chats_cache', JSON.stringify(chats)); } catch(e) {}
        chats.slice(0, 5).forEach(c => {
            if (c.partner_avatar && !c.partner_avatar.includes('default') && !c.partner_avatar.startsWith('emoji:')) {
                AvatarCache.getOrFetch(c.partner_avatar, c.partner_id)
                    .then(src => { chatPartnerAvatarSrc[c.partner_id] = src; })
                    .catch(() => {});
            }
        });
    } catch(e) {
        clearTimeout(tid);
        console.error('loadChats:', e);
        if (!recentChats.length) _showChatsError();
        _scheduleChatsRetry();
    }
    finally { _chatsLoading = false; }
}

function _scheduleChatsRetry() {
    // Exponential backoff: 2s, 4s, 8s, 16s, max 30s
    _loadChatsRetryCount = Math.min(_loadChatsRetryCount + 1, 5);
    const delay = Math.min(2000 * Math.pow(2, _loadChatsRetryCount - 1), 30000);
    setTimeout(() => {
        if (Date.now() - _lastChatsLoad > delay - 500) loadChats(true);
    }, delay);
}

function _showChatsError() {
    const container = document.getElementById('chat-list');
    if (!container) return;
    container.innerHTML = `<div style="padding:40px 20px;text-align:center">
        <div style="font-size:32px;margin-bottom:12px">📡</div>
        <div style="font-size:15px;font-weight:600;margin-bottom:6px">Не удалось загрузить чаты</div>
        <div style="font-size:13px;color:var(--text-2);margin-bottom:18px">Проверьте подключение к интернету</div>
        <button onclick="loadChats(true)" style="padding:10px 24px;background:var(--accent);border:none;border-radius:14px;color:#000;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit">Повторить</button>
    </div>`;
}
// Debounced loadChats — не вызываем чаще раз в 1.5с при потоке сообщений
let _loadChatsDebTimer = null;
function _debouncedLoadChats() {
    clearTimeout(_loadChatsDebTimer);
    _loadChatsDebTimer = setTimeout(() => loadChats(), 1200);
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
// Чаты, помеченные удалёнными — персистентны через localStorage
const _WC_DEL_CHATS_KEY   = '_wc_del_chat_ids';
const _WC_DEL_PARTNER_KEY = '_wc_del_partner_ids';
const _deletedChatIds = new Set(
    JSON.parse(localStorage.getItem(_WC_DEL_CHATS_KEY) || '[]')
);
// Партнёры, чьи переписки удалены — при открытии чата кэш игнорируется
const _deletedPartnerIds = new Set(
    JSON.parse(localStorage.getItem(_WC_DEL_PARTNER_KEY) || '[]')
);
function _persistDeletedChatIds() {
    try {
        const arr = Array.from(_deletedChatIds).slice(-200);
        localStorage.setItem(_WC_DEL_CHATS_KEY, JSON.stringify(arr));
    } catch(e) {}
}
function _persistDeletedPartnerIds() {
    try {
        const arr = Array.from(_deletedPartnerIds).slice(-200);
        localStorage.setItem(_WC_DEL_PARTNER_KEY, JSON.stringify(arr));
    } catch(e) {}
}

async function _doDeleteChat(chatId) {
    // ─── Находим чат ДО любых изменений ───
    const chat = recentChats.find(ch => ch.chat_id === chatId);
    const partnerId  = chat?.partner_id  || null;
    const groupId    = chat?.group_id    || null;
    const ck_private = partnerId ? `p_${partnerId}` : null;
    const ck_group   = groupId   ? `g_${groupId}`   : null;

    // ─── 1. Помечаем удалёнными (ID чата + ID партнёра) ───
    _deletedChatIds.add(chatId);
    _persistDeletedChatIds();
    if (partnerId) {
        _deletedPartnerIds.add(partnerId);
        _persistDeletedPartnerIds();
    }

    // ─── 2. Чистим память СРАЗУ ───
    if (ck_private) delete messagesByChatCache[ck_private];
    if (ck_group)   delete messagesByChatCache[ck_group];

    // ─── 3. Чистим IndexedDB (awaited!) ───
    const delTasks = [];
    if (ck_private) delTasks.push(MsgDB.delete(ck_private));
    if (ck_group)   delTasks.push(MsgDB.delete(ck_group));
    // Также чистим WCCache profiles/chats store
    delTasks.push(WCCache.del('chats', String(chatId)));
    if (partnerId) delTasks.push(WCCache.del('profiles', String(partnerId)));
    await Promise.allSettled(delTasks);

    // ─── 4. Чистим localStorage ───
    try {
        const ls = JSON.parse(localStorage.getItem('waychat_chats_cache') || '[]');
        localStorage.setItem('waychat_chats_cache',
            JSON.stringify(ls.filter(ch => ch.chat_id !== chatId)));
    } catch(e) {}

    // ─── 5. Убираем из массива recentChats ───
    recentChats = recentChats.filter(ch => ch.chat_id !== chatId);

    // ─── 6. Убираем из DOM ───
    const container = document.getElementById('chat-list');
    if (container && chat) {
        const key = chat.is_group ? `g_${groupId}` : `p_${partnerId}`;
        const el  = container.querySelector(`[data-chat-key="${key}"]`);
        if (el) {
            el.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
            el.style.opacity    = '0';
            el.style.transform  = 'translateX(-40px)';
            setTimeout(() => el.remove(), 220);
        }
    }

    // ─── 7. Закрываем чат если открыт ───
    if (currentChatId === chatId) {
        document.getElementById('chat-window')?.classList.remove('active');
        document.getElementById('main-content')?.classList.remove('chat-depth');
        document.getElementById('fab-btn-el') && (document.getElementById('fab-btn-el').style.display = '');
        currentChatId = null;
        currentPartnerId = null;
    }

    // ─── 8. Отправляем на сервер ───
    try {
        await apiFetch('/delete_chat/' + chatId, { method: 'POST' });
        showToast('Чат удалён', 'success');
    } catch(e) {
        // Откат — только если сервер не ответил
        _deletedChatIds.delete(chatId);
        _persistDeletedChatIds();
        if (partnerId) { _deletedPartnerIds.delete(partnerId); _persistDeletedPartnerIds(); }
        showToast('Ошибка удаления', 'error');
        loadChats(true);
    }
}

function _skeletonChatRow(wide = false) {
    const w1 = wide ? '160px' : '120px';
    const w2 = wide ? '90px' : '70px';
    return '<div style="display:flex;align-items:center;gap:14px;padding:11px 4px">'
        + '<div class="skeleton-shimmer" style="width:58px;height:58px;border-radius:50%;flex-shrink:0"></div>'
        + '<div style="flex:1">'
        + '<div style="display:flex;justify-content:space-between;margin-bottom:9px">'
        + '<div class="skeleton-shimmer" style="height:14px;width:'+w1+';border-radius:7px"></div>'
        + '<div class="skeleton-shimmer" style="height:11px;width:38px;border-radius:6px"></div>'
        + '</div>'
        + '<div class="skeleton-shimmer" style="height:11px;width:'+w2+';border-radius:6px"></div>'
        + '</div></div>';
}

function showChatSkeleton() {
    const container = document.getElementById('chat-list');
    if (!container || container.querySelector('[data-chat-key]')) return;
    container.innerHTML = '<div data-skeleton style="display:flex;flex-direction:column;gap:2px">'
        + _skeletonChatRow(true) + _skeletonChatRow() + _skeletonChatRow(true)
        + _skeletonChatRow() + _skeletonChatRow(true) + '</div>';
}

// Флаг — идёт ли рендер (защита от concurrent вызовов)
let _renderingChats = false;

function renderChatList(chats) {
    if (_renderingChats) return; // не рендерим параллельно
    const container = document.getElementById('chat-list');
    if (!container) return;

    // Фильтруем удалённые чаты
    if (typeof _deletedChatIds !== 'undefined') {
        chats = chats.filter(ch => !_deletedChatIds.has(ch.chat_id));
    }

    if (!chats.length) {
        container.innerHTML = `<div style="padding:60px 0;text-align:center;opacity:0.2">
            <div style="margin-bottom:12px;display:flex;justify-content:center">${ICONS.chats.replace('currentColor','rgba(255,255,255,0.3)')}</div>
            <p style="font-size:16px;font-weight:500">Нет переписок</p>
            <p style="font-size:13px;margin-top:4px">Нажмите + чтобы добавить контакт</p>
        </div>`;
        updateUnreadBadge(0);
        return;
    }

    _renderingChats = true;
    try {

    // Удаляем скелетон НЕМЕДЛЕННО при рендере реальных чатов
    const sk = container.querySelector('[data-skeleton]');
    if (sk) sk.remove();

    const makeKey = (chat) => chat.is_group ? `g_${chat.group_id}` : `p_${chat.partner_id}`;

    // Собираем карту уже существующих элементов
    const existingMap = new Map();
    container.querySelectorAll('[data-chat-key]').forEach(el => existingMap.set(el.dataset.chatKey, el));

    // Удаляем исчезнувшие чаты
    const newKeys = new Set(chats.map(makeKey));
    existingMap.forEach((el, key) => { if (!newKeys.has(key)) el.remove(); });

    // Строим весь список в DocumentFragment — один reflow
    const frag = document.createDocumentFragment();
    let totalUnread = 0;

    chats.forEach((chat, index) => {
        totalUnread += chat.unread_count || 0;
        const isUnread     = (chat.unread_count || 0) > 0;
        const isGroup      = !!chat.is_group;
        const partnerId    = isGroup ? chat.group_id   : chat.partner_id;
        const partnerName  = isGroup ? (chat.group_name || 'Группа') : chat.partner_name;
        const partnerAvatar= isGroup ? (chat.group_avatar || '') : (chat.partner_avatar || '');
        const displayName  = isGroup ? partnerName : getContactDisplayName(partnerId, partnerName);
        const _lastType    = chat.last_message_type || '';
        const _lastText    = chat.last_message || '';
        // Format preview based on message type
        let preview;
        if (_lastType === 'audio')       preview = '🎙 Голосовое';
        else if (_lastType === 'image' || _lastType === 'photo') preview = '🖼 Фото';
        else if (_lastType === 'video')  preview = '📹 Видео';
        else if (_lastType === 'call_audio') preview = '📞 Звонок';
        else if (_lastType === 'call_video') preview = '📹 Видеозвонок';
        else if (_lastText && _lastText.startsWith('WayChat:')) preview = _lastText.split(':').slice(1).join(':').trim() || 'Сообщение';
        else preview = _lastText || 'Начните переписку';
        const time         = getChatPreviewTime(chat.raw_timestamp || chat.timestamp) || '';
        const chatKey      = makeKey(chat);

        let div = existingMap.get(chatKey);
        const isNew = !div;

        if (isNew) {
            div = document.createElement('div');
            div.className = 'chat-item chat-item-animate';
            div.dataset.chatKey   = chatKey;
            div.dataset.partnerId = String(partnerId);
            if (isGroup) div.dataset.isGroup = '1';

            // Подсказки для свайпов
            const hintR = document.createElement('div');
            hintR.className = 'swipe-hint-right';
            hintR.style.cssText = 'position:absolute;left:14px;top:50%;transform:translateY(-50%);display:flex;align-items:center;gap:6px;opacity:0;pointer-events:none;z-index:1;transition:opacity .15s';
            hintR.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg><span style="font-size:12px;font-weight:600;color:var(--accent)">Ответить</span>';
            div.appendChild(hintR);

            const hintL = document.createElement('div');
            hintL.className = 'swipe-hint-left';
            hintL.style.cssText = 'position:absolute;right:14px;top:50%;transform:translateY(-50%);display:flex;align-items:center;gap:6px;opacity:0;pointer-events:none;z-index:1;transition:opacity .15s';
            hintL.innerHTML = '<span style="font-size:12px;font-weight:600;color:rgba(99,102,241,0.9)">Архив</span><svg width="18" height="18" viewBox="0 0 24 24" fill="none"><polyline points="21 8 21 21 3 21 3 8" stroke="rgba(99,102,241,0.9)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><rect x="1" y="3" width="22" height="5" rx="1" stroke="rgba(99,102,241,0.9)" stroke-width="2"/></svg>';
            div.appendChild(hintL);

            // Аватар
            const avaWrap = document.createElement('div');
            avaWrap.style.cssText = 'position:relative;flex-shrink:0;width:58px;height:58px';

            const _ai = document.createElement('div');
            _ai.style.cssText = 'position:absolute;inset:'+(chat.has_moment&&!isGroup?'4px':'0')+';border-radius:50%;overflow:hidden';
            _ai.innerHTML = getAvatarHtml({id:partnerId,name:partnerName,avatar:partnerAvatar},'w-full h-full');
            avaWrap.appendChild(_ai);

            // SVG-кольцо моментов
            if (!isGroup && chat.has_moment) {
                const mc=Math.min(chat.moment_count||1,8);
                const _ns='http://www.w3.org/2000/svg';
                const sv=document.createElementNS(_ns,'svg');
                sv.setAttribute('width','58');sv.setAttribute('height','58');sv.setAttribute('viewBox','0 0 58 58');
                sv.style.cssText='position:absolute;inset:0;pointer-events:none';
                const _cx=29,_cy=29,_r=27,_gap=mc>1?5:0,_seg=(360-_gap*mc)/mc;
                for(let i=0;i<mc;i++){
                    const sd=-90+i*(_seg+_gap),ed=sd+_seg,tr=d=>d*Math.PI/180;
                    const x1=_cx+_r*Math.cos(tr(sd)),y1=_cy+_r*Math.sin(tr(sd));
                    const x2=_cx+_r*Math.cos(tr(ed)),y2=_cy+_r*Math.sin(tr(ed));
                    const p=document.createElementNS(_ns,'path');
                    p.setAttribute('d',`M${x1.toFixed(1)} ${y1.toFixed(1)} A${_r} ${_r} 0 ${_seg>180?1:0} 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`);
                    p.setAttribute('stroke','var(--accent)');p.setAttribute('stroke-width','3.5');
                    p.setAttribute('fill','none');p.setAttribute('stroke-linecap','round');
                    sv.appendChild(p);
                }
                avaWrap.appendChild(sv);
            }

            if (!isGroup) {
                const dot = document.createElement('div');
                dot.className = 'online-dot';
                dot.dataset.onlineDot = '1';
                dot.style.display = chat.online ? 'block' : 'none';
                avaWrap.appendChild(dot);
            } else {
                const badge = document.createElement('div');
                badge.style.cssText = 'position:absolute;bottom:-1px;right:-1px;width:18px;height:18px;background:#3b82f6;border-radius:50%;border:2px solid #000;display:flex;align-items:center;justify-content:center';
                badge.innerHTML = `<svg width="9" height="9" viewBox="0 0 24 24" fill="none"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" stroke="white" stroke-width="2.5" stroke-linecap="round"/><circle cx="9" cy="7" r="4" stroke="white" stroke-width="2.5"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" stroke="white" stroke-width="2" stroke-linecap="round"/></svg>`;
                avaWrap.appendChild(badge);
            }

            const info = document.createElement('div');
            info.className = 'chat-info';
            info.style.cssText = 'flex:1;min-width:0;padding-bottom:9px';

            div.appendChild(avaWrap);
            div.appendChild(info);

            // Клик
            div.onclick = ((_g,_pid,_pn,_pa) => () => { vibrate(8); _g ? openGroupChat(_pid,_pn,_pa) : openChat(_pid,_pn,_pa); })(isGroup,partnerId,partnerName,partnerAvatar);

            // Long-press
            let _lpt=null,_lf=false;
            div.addEventListener('pointerdown',()=>{_lf=false;_lpt=setTimeout(()=>{_lf=true;vibrate(40);_showChatListMenu(div,isGroup,partnerId,partnerName,chat.chat_id,partnerAvatar);},550);});
            const _lpc=()=>clearTimeout(_lpt);
            div.addEventListener('pointerup',_lpc);div.addEventListener('pointermove',_lpc);div.addEventListener('pointercancel',_lpc);
            div.addEventListener('click',e=>{if(_lf){e.stopImmediatePropagation();_lf=false;}},true);
        } else {
            // Обновляем onclick (аватар/имя могли измениться)
            div.onclick = ((_g,_pid,_pn,_pa) => () => { vibrate(8); _g ? openGroupChat(_pid,_pn,_pa) : openChat(_pid,_pn,_pa); })(isGroup,partnerId,partnerName,partnerAvatar);
            // Онлайн-точка
            const dot = div.querySelector('[data-online-dot]');
            if (dot && !isGroup) dot.style.display = chat.online ? 'block' : 'none';
        }

        // Обновляем текстовый контент (info)
        const info = div.querySelector('.chat-info');
        if (info) {
            info.innerHTML = `
                <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:3px">
                    <span style="font-weight:${isUnread?'700':'600'};font-size:16px;letter-spacing:-0.2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:190px">${escHtml(displayName)}</span>
                    <span style="font-size:11px;font-weight:${isUnread?'700':'400'};color:${isUnread?'var(--accent)':'var(--text-2)'};flex-shrink:0;margin-left:8px">${time}</span>
                </div>
                <div style="display:flex;justify-content:space-between;align-items:center">
                    <p style="font-size:14px;color:${isUnread?'rgba(255,255,255,0.85)':'var(--text-2)'};font-weight:${isUnread?'500':'400'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;margin-right:8px">${escHtml(preview)}</p>
                    ${isUnread?`<span style="background:var(--accent);color:#000;font-size:10px;font-weight:800;min-width:20px;height:20px;border-radius:10px;display:flex;align-items:center;justify-content:center;padding:0 5px;flex-shrink:0">${chat.unread_count}</span>`:''}
                </div>`;
        }

        frag.appendChild(div);
    });

    // BUG-A FIX: surgical DOM update — NO innerHTML wipe
    // Move/insert items in server-defined order without destroying existing elements
    const fragItems = Array.from(frag.childNodes);
    let refNode = container.firstChild;
    fragItems.forEach(node => {
        const key = node.dataset?.chatKey;
        const existing = key ? container.querySelector(`[data-chat-key="${key}"]`) : null;
        if (existing) {
            // Item already in DOM — move to correct position if needed
            if (existing !== refNode) {
                container.insertBefore(existing, refNode || null);
            } else {
                refNode = refNode.nextSibling;
            }
        } else {
            // Truly new item — insert at correct position
            container.insertBefore(node, refNode || null);
        }
    });
    // Remove any leftover items not in new list (already handled above via existingMap diff)

    updateUnreadBadge(totalUnread);
    } finally { _renderingChats = false; }
}

function getContactDisplayName(userId, defaultName) {
    return contactCustomNames[userId] || defaultName;
}

function updateUnreadBadge(total) {
    unreadTotal = total;
    const b = document.getElementById('total-unread-badge');
    if (b) { b.textContent = total > 99 ? '99+' : total; b.style.display = total === 0 ? 'none' : 'inline-flex'; }
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
async function apiFetch(url, options = {}, _retry = 0) {
    const headers = { ...(options.headers || {}) };
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 15000); // 15s таймаут
    try {
        const res = await fetch(url, { ...options, headers: {...headers, 'Accept-Encoding': 'gzip, deflate'}, credentials: 'include', signal: controller.signal });
        clearTimeout(tid);
        if (res.status === 401 || (res.redirected && res.url.includes('/login'))) {
            location.href = '/login';
            return null;
        }
        // Авто-retry при 503 (сервер перегружен) — 1 раз
        if (res.status === 503 && _retry === 0 && options.method !== 'POST') {
            await new Promise(r => setTimeout(r, 1500));
            return apiFetch(url, options, 1);
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
    document.getElementById('search-results').style.display = 'block';
    document.getElementById('search-results').classList.remove('hidden');
    _hideMomentsBar?.();
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
    if (inp) { inp.value = ''; inp.blur(); }
    const cancelBtn = document.getElementById('search-cancel');
    if (cancelBtn) cancelBtn.style.display = 'none';
    const results = document.getElementById('search-results');
    if (results) { results.classList.add('hidden'); results.style.display = 'none'; }
    const cl = document.getElementById('chat-list');
    if (cl) cl.style.display = 'block';
}

// Умный поиск: переключение категорий — убрано по требованию дизайна
let _searchCategory = 'all';

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
                d.onclick = () => {
                    // FIX P3: если партнёр в списке удалённых — снимаем блокировку только явно,
                    // это значит пользователь сознательно начинает переписку заново
                    if (typeof _deletedPartnerIds !== 'undefined' && _deletedPartnerIds.has(+u.id)) {
                        _deletedPartnerIds.delete(+u.id);
                        if (typeof _persistDeletedPartnerIds === 'function') _persistDeletedPartnerIds();
                        const _oldChat = recentChats && recentChats.find(c => +c.partner_id === +u.id);
                        if (_oldChat && typeof _deletedChatIds !== 'undefined') {
                            _deletedChatIds.delete(_oldChat.chat_id);
                            if (typeof _persistDeletedChatIds === 'function') _persistDeletedChatIds();
                        }
                    }
                    cancelSearch(); openChat(u.id, u.name, u.avatar_url||u.avatar);
                };
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


// ══════════════════════════════════════════════════════════
//  ОТКРЫТИЕ ГРУППОВОГО ЧАТА
// ══════════════════════════════════════════════════════════


// ══════════════════════════════════════════════════════════
//  ЗАГРУЗКА СООБЩЕНИЙ — КЭШ + ПАГИНАЦИЯ (30-40 за раз)
// ══════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════
//  CHAT ENGINE v2 — быстрый, надёжный, без race conditions
//  Единственный источник истины: сервер → messagesByChatCache → UI
// ══════════════════════════════════════════════════════════════════

// Защита от одновременного открытия нескольких чатов
let _chatOpenId = 0;

async function openChat(id, name, avatar) {
    const _myOpenId = ++_chatOpenId;  // уникальный ID этого вызова
    const _prevChatId = currentChatId;
    if (_prevChatId) {
        try { socket.emit('leave_chat', { chat_id: _prevChatId }); } catch(e) {}
    }

    // ── 1. Сброс состояния ──────────────────────────────────────
    currentPartnerId = id;
    currentChatId    = null;
    currentChatType  = 'private';
    loadingMessages  = false;
    hasMoreMessages  = true;
    _loadMsgsReqId++; // FIX: invalidate any in-flight loadMessages
    // FIX: clear scroll-to-bottom badge on chat open
    const _badge = document.getElementById('wc-scroll-badge');
    if (_badge) { _badge.textContent = ''; _badge.style.display = 'none'; }

    // ── 2. Показываем окно чата мгновенно ───────────────────────
    const win  = document.getElementById('chat-window');
    const msgs = document.getElementById('messages');
    if (!win || !msgs) return;

    win.classList.add('active');
    // Скрываем пустой экран
    const emptyState = document.getElementById('chat-empty-state');
    if (emptyState) emptyState.style.display = 'none';
    closeFabMenu();
    const fabBtn = document.getElementById('fab-btn-el');
    if (fabBtn && !window.matchMedia('(min-width:768px)').matches) fabBtn.style.display = 'none';
    // На desktop эффект глубины не нужен
    if (!window.matchMedia('(min-width:768px)').matches) {
        document.getElementById('main-content')?.classList.add('chat-depth');
    }

    // ── 3. Заголовок ────────────────────────────────────────────
    const displayName = getContactDisplayName(id, name);
    const elName   = document.getElementById('chat-name');
    const elStatus = document.getElementById('chat-status');
    const elDot    = document.getElementById('chat-online-dot');
    if (elName)   elName.textContent   = displayName;
    if (elStatus) elStatus.textContent = '...';
    if (elDot)    elDot.style.display  = 'none';

    // Бейдж непрочитанных на кнопке "назад"
    const backBadge = document.getElementById('chat-back-badge');
    if (backBadge) {
        const chatData = recentChats.find(ch => ch.partner_id === id);
        const unread = chatData ? (chatData.unread_count || 0) : 0;
        if (unread > 0) {
            backBadge.textContent = unread > 99 ? '99+' : String(unread);
            backBadge.style.display = 'inline-flex';
        } else {
            backBadge.style.display = 'none';
        }
    }

    // ── 4. Аватар ───────────────────────────────────────────────
    const headerBox = document.getElementById('chat-ava-header');
    if (headerBox) {
        const cachedSrc = chatPartnerAvatarSrc[id];
        headerBox.innerHTML = cachedSrc
            ? `<img src="${cachedSrc}" class="w-10 h-10 rounded-full object-cover" data-uid="${id}" style="flex-shrink:0;border-radius:50%;object-fit:cover">`
            : getAvatarHtml({id, name, avatar}, 'w-10 h-10');
        if (avatar && !avatar.includes('default') && !cachedSrc) {
            AvatarCache.getOrFetch(avatar, id).then(src => {
                if (src) {
                    chatPartnerAvatarSrc[id] = src;
                    document.querySelectorAll(`[data-uid="${id}"]`).forEach(el => {
                        if (el.tagName === 'IMG') el.src = src;
                    });
                }
            }).catch(() => {});
        }
    }

    // ── 5. Кэш сообщений ─────────────────────────────────────
    VirtualList.destroy();
    msgs.innerHTML = '';
    const cacheKey = `p_${id}`;

    // ЯДЕРНАЯ ОЧИСТКА: если партнёр в списке удалённых — убиваем ВСЕ кэши
    if (_deletedPartnerIds.has(id)) {
        delete messagesByChatCache[cacheKey];
        // Ждём пока IndexedDB реально удалит запись
        try { await MsgDB.delete(cacheKey); } catch(e) {}
        try { await WCCache.del('profiles', String(id)); } catch(e) {}
        // Не показываем НИЧЕГО — только пустой экран
        msgs.innerHTML = '';
    } else {
        const cached = messagesByChatCache[cacheKey];
        if (cached?.messages?.length) {
            renderMessagesFromCache(cached.messages);
            scrollDown(false);
            if (elStatus) elStatus.textContent = 'обновление...';
        } else {
            _showChatSkeleton(msgs);
            MsgDB.load(cacheKey).then(idb => {
                if (_chatOpenId !== _myOpenId) return;
                // Снова проверяем — вдруг удалили пока загружалось
                if (_deletedPartnerIds.has(id)) {
                    msgs.innerHTML = '';
                    return;
                }
                if (idb?.length) {
                    messagesByChatCache[cacheKey] = { messages: idb, lastFetch: 0 };
                    msgs.innerHTML = '';
                    renderMessagesFromCache(idb);
                    scrollDown(false);
                    if (elStatus) elStatus.textContent = 'обновление...';
                }
            }).catch(() => {});
        }
    }

    // ── 6. Получаем chat_id и грузим свежие сообщения ───────────
    try {
        const res = await apiFetch(`/get_chat_id/${id}`);
        if (_chatOpenId !== _myOpenId) return; // чат сменился пока грузились

        if (!res || !res.ok) {
            if (elStatus) elStatus.textContent = 'ошибка соединения';
            _showChatError(msgs, () => openChat(id, name, avatar));
            return;
        }

        const data = await res.json();
        if (_chatOpenId !== _myOpenId) return;

        if (!data.chat_id) {
            // Чата нет — создаём новый
            if (elStatus) elStatus.textContent = 'новый чат';
            msgs.innerHTML = `<div style="padding:60px 0;text-align:center;opacity:0.2">
                <div style="font-size:40px;margin-bottom:10px">👋</div>
                <p>Начните переписку!</p>
            </div>`;
            currentChatId = null;
            setupVoiceRecording();
            return;
        }

        currentChatId = data.chat_id;
        socket.emit('enter_chat', { chat_id: currentChatId });

        // Статус онлайн
        const isOnline = data.partner_online;
        if (elStatus) elStatus.textContent = isOnline ? 'в сети' : 'был(а) недавно';
        if (elDot)    elDot.style.display  = isOnline ? 'block' : 'none';

        // FIX P3 CRITICAL: если партнёр в _deletedPartnerIds — НЕ грузим сообщения с сервера.
        // _deletedPartnerIds снимается ТОЛЬКО в поиске (явный тап пользователя).
        // Это закрывает главную дыру: сервер возвращает chat_id → loadMessages тянул старые сообщения.
        if (_deletedPartnerIds.has(id)) {
            const _ck = `p_${id}`;
            delete messagesByChatCache[_ck];
            try { await MsgDB.delete(_ck); } catch(e) {}
            const _m = document.getElementById('messages');
            if (_m) _m.innerHTML = '<div style="padding:60px 0;text-align:center;opacity:0.2"><div style="font-size:40px;margin-bottom:10px">\u{1F44B}</div><p>\u{041D}\u{0430}\u{0447}\u{043D}\u{0438}\u{0442}\u{0435} \u{043F}\u{0435}\u{0440}\u{0435}\u{043F}\u{0438}\u{0441}\u{043A}\u{0443}!</p></div>';
            setupVoiceRecording();
            return;
        }

        // Грузим сообщения с сервера
        await loadMessages(true);
        if (_chatOpenId !== _myOpenId) return;

        setupVoiceRecording();
        // FIXED: _attachScrollListener и скролл уже делает VirtualList.setMessages
        // Просто убеждаемся что кнопка вниз есть
        setTimeout(() => {
            if (_chatOpenId === _myOpenId) {
                _ensureScrollBtn();
                _initScrollDownBtn();
                // BUG-I FIX: only scroll if VirtualList hasn't already done it
                // Check if at bottom already (VL sets scrollTop in _scrollAfterRender)
                if (msgs && msgs.scrollHeight > msgs.clientHeight && !_isNearBottom(msgs)) {
                    msgs.scrollTop = msgs.scrollHeight;
                }
            }
        }, 200);

    } catch(e) {
        if (_chatOpenId !== _myOpenId) return;
        console.error('[openChat]', e);
        if (elStatus) elStatus.textContent = 'ошибка';
        _showChatError(msgs, () => openChat(id, name, avatar));
    }
}

async function openGroupChat(groupId, groupName, groupAvatar) {
    const _myOpenId = ++_chatOpenId;

    currentPartnerId = groupId;
    currentChatId    = null;
    currentChatType  = 'group';
    loadingMessages  = false;
    hasMoreMessages  = true;

    const win  = document.getElementById('chat-window');
    const msgs = document.getElementById('messages');
    if (!win || !msgs) return;

    win.classList.add('active');
    // Скрываем пустой экран
    const emptyState2 = document.getElementById('chat-empty-state');
    if (emptyState2) emptyState2.style.display = 'none';
    closeFabMenu();
    const fabBtn = document.getElementById('fab-btn-el');
    if (fabBtn && !window.matchMedia('(min-width:768px)').matches) fabBtn.style.display = 'none';
    // На desktop эффект глубины не нужен
    if (!window.matchMedia('(min-width:768px)').matches) {
        document.getElementById('main-content')?.classList.add('chat-depth');
    }

    const elName   = document.getElementById('chat-name');
    const elStatus = document.getElementById('chat-status');
    const elDot    = document.getElementById('chat-online-dot');
    if (elName)   elName.textContent   = groupName;
    if (elStatus) elStatus.textContent = 'группа';
    if (elDot)    elDot.style.display  = 'none';

    const headerBox = document.getElementById('chat-ava-header');
    if (headerBox) headerBox.innerHTML = getAvatarHtml({id:groupId, name:groupName, avatar:groupAvatar}, 'w-10 h-10');

    VirtualList.destroy();
    msgs.innerHTML = '';
    const cacheKey = `g_${groupId}`;
    const cached   = messagesByChatCache[cacheKey];

    if (cached?.messages?.length) {
        renderMessagesFromCache(cached.messages);
        scrollDown(false);
        if (elStatus) elStatus.textContent = 'обновление...';
    } else {
        _showChatSkeleton(msgs);
        MsgDB.load(cacheKey).then(idb => {
            if (_chatOpenId !== _myOpenId) return;
            if (idb?.length) {
                messagesByChatCache[cacheKey] = { messages: idb, lastFetch: 0 };
                msgs.innerHTML = '';
                renderMessagesFromCache(idb);
                scrollDown(false);
            }
        }).catch(() => {});
    }

    try {
        const res = await apiFetch(`/get_group_chat_id/${groupId}`);
        if (_chatOpenId !== _myOpenId) return;
        if (!res || !res.ok) {
            _showChatError(msgs, () => openGroupChat(groupId, groupName, groupAvatar));
            return;
        }

        const data = await res.json();
        if (_chatOpenId !== _myOpenId) return;
        if (!data.chat_id) return;

        currentChatId = data.chat_id;
        socket.emit('enter_chat', { chat_id: currentChatId });

        if (elStatus) elStatus.textContent = `${data.member_count || 0} участников`;
        if (data.group_avatar && headerBox) {
            headerBox.innerHTML = getAvatarHtml({id:groupId, name:groupName, avatar:data.group_avatar}, 'w-10 h-10');
            chatPartnerAvatarSrc[groupId] = data.group_avatar;
        }

        await loadMessages(true);
        if (_chatOpenId !== _myOpenId) return;

        setupVoiceRecording();
        // FIXED: _attachScrollListener и скролл уже делает VirtualList.setMessages
        // Просто убеждаемся что кнопка вниз есть
        setTimeout(() => {
            if (_chatOpenId === _myOpenId) {
                _ensureScrollBtn();
                _initScrollDownBtn();
                // Дополнительный принудительный скролл если VirtualList ещё грузится
                if (msgs && msgs.scrollHeight > msgs.clientHeight) {
                    msgs.scrollTop = msgs.scrollHeight;
                }
            }
        }, 200);

    } catch(e) {
        if (_chatOpenId !== _myOpenId) return;
        console.error('[openGroupChat]', e);
        _showChatError(msgs, () => openGroupChat(groupId, groupName, groupAvatar));
    }
}

// ── Helpers ──────────────────────────────────────────────────────

function _showChatSkeleton(container) {
    if (!container) return;
    container.innerHTML = [0,1,2,3,4].map((_, i) => {
        const isOut = i % 3 === 0;
        const w     = [62,80,55,72,45][i];
        return `<div class="msg-row ${isOut?'out':'in'}" style="pointer-events:none">
            <div style="max-width:${w}%;height:38px;border-radius:18px;background:rgba(255,255,255,0.07);animation:wcSkPulse 1.4s ease-in-out infinite;animation-delay:${i*0.1}s"></div>
        </div>`;
    }).join('');
}

function _showChatError(container, retryFn) {
    if (!container) return;
    if (container.querySelector('[data-msg-id]')) return; // уже есть сообщения
    container.innerHTML = `<div style="padding:60px 20px;text-align:center;opacity:0.7">
        <div style="font-size:36px;margin-bottom:12px">📡</div>
        <div style="font-size:15px;font-weight:600;margin-bottom:6px">Нет соединения</div>
        <div style="font-size:13px;color:rgba(255,255,255,0.45);margin-bottom:18px">Проверьте подключение к интернету</div>
        <button onclick="(${retryFn.toString()})()" style="padding:11px 28px;background:var(--accent,#10b981);border:none;border-radius:14px;color:#000;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit">Повторить</button>
    </div>`;
}

const MESSAGES_PER_PAGE = 35;

// FIX: global request counter — each loadMessages call gets a unique ID
// If a newer call starts, the older one's response is silently dropped
let _loadMsgsReqId = 0;

async function loadMessages(initial = false, retryCount = 0) {
    if (!currentChatId) return;
    // Блокируем загрузку если партнёр в списке удалённых (переписка удалена)
    if (currentPartnerId && _deletedPartnerIds.has(currentPartnerId)) return;
    if (loadingMessages && !initial) return;
    if (!initial && !hasMoreMessages) return;

    loadingMessages = true;
    const _reqId       = ++_loadMsgsReqId;  // FIX: unique request ID
    const _savedChatId = currentChatId;
    const container    = document.getElementById('messages');
    const cacheKey     = currentChatType === 'group'
        ? `g_${currentPartnerId}`
        : `p_${currentPartnerId}`;

    try {
        let beforeId = null;
        if (!initial && container) {
            const firstMsg = container.querySelector('[data-msg-id]');
            if (firstMsg) beforeId = +firstMsg.dataset.msgId;
        }

        const url = `/get_messages/${currentChatId}?limit=${MESSAGES_PER_PAGE}${beforeId ? `&before_id=${beforeId}` : ''}`;
        const res  = await apiFetch(url);

        // FIX: drop stale response — newer request already in flight
        if (_reqId !== _loadMsgsReqId) return;
        // Проверяем что чат не сменился пока грузили
        if (currentChatId !== _savedChatId) return;

        if (!res || !res.ok) {
            if (retryCount < 3) {
                loadingMessages = false;
                setTimeout(() => {
                    if (currentChatId === _savedChatId) loadMessages(initial, retryCount + 1);
                }, 800 * Math.pow(2, retryCount));
                return;
            }
            if (initial && container && !container.querySelector('[data-msg-id]')) {
                _showChatError(container, () => loadMessages(true));
            }
            return;
        }

        const msgs = await res.json();
        if (!Array.isArray(msgs)) { console.error('[loadMessages] not array'); return; }
        if (currentChatId !== _savedChatId) return; // чат сменился
        // Финальная проверка: если партнёр был удалён пока грузились — показываем пустой экран
        if (currentPartnerId && _deletedPartnerIds.has(currentPartnerId)) {
            if (container) container.innerHTML = `<div style="padding:60px 0;text-align:center;opacity:0.2">
                <div style="font-size:40px;margin-bottom:10px">👋</div>
                <p>Начните переписку!</p>
            </div>`;
            return;
        }

        if (msgs.length < MESSAGES_PER_PAGE) hasMoreMessages = false;

        if (initial) {
            // Единственный источник истины — сервер
            messagesByChatCache[cacheKey] = {
                messages:  msgs,
                lastFetch: Date.now(),
            };
            if (container) container.innerHTML = '';

            if (!msgs.length) {
                if (container) container.innerHTML = `<div style="padding:60px 0;text-align:center;opacity:0.2">
                    <div style="font-size:40px;margin-bottom:10px">👋</div>
                    <p>Начните переписку!</p>
                </div>`;
                return;
            }
            renderMessagesFromCache(msgs);
            scrollDown(false);
            MsgDB.save(cacheKey, msgs).catch(() => {});
            socket.emit('mark_read', { chat_id: currentChatId });
        } else {
            // Пагинация — добавляем в начало
            const existing = messagesByChatCache[cacheKey]?.messages || [];
            // FIX: deduplicate by message ID — prevents duplicates on reconnect
            const existingIds = new Set(existing.map(m => m.id));
            const newMsgs = msgs.filter(m => !existingIds.has(m.id));
            messagesByChatCache[cacheKey] = {
                messages:  [...newMsgs, ...existing],
                lastFetch: messagesByChatCache[cacheKey]?.lastFetch || 0,
            };
            if (newMsgs.length > 0) VirtualList.prependMessages(newMsgs);
        }
        currentPage++;

    } catch(e) {
        if (currentChatId !== _savedChatId) return;
        console.error('[loadMessages]', e);
        if (retryCount < 2) {
            loadingMessages = false;
            setTimeout(() => {
                if (currentChatId === _savedChatId) loadMessages(initial, retryCount + 1);
            }, 1000);
            return;
        }
    } finally {
        loadingMessages = false;
    }
}



function renderMessagesFromCache(msgs) {
    // FIX: filter deleted + deduplicate by ID (server may send dupes on reconnect)
    const seen = new Set();
    msgs = msgs
        .filter(m => !_deletedMsgIds.has(String(m.id)))
        .filter(m => {
            if (!m.id || seen.has(m.id)) return false;
            seen.add(m.id);
            return true;
        });
    const container = document.getElementById('messages');
    if (!container) return;
    // FIX SMOOTH TRANSITION: fade out before wiping, fade in after render
    container.style.transition = 'opacity 0.12s ease';
    container.style.opacity = '0';
    requestAnimationFrame(() => {
        if (!container.querySelector('.vl-ph')) {
            VirtualList.mount(container);
        }
        VirtualList.setMessages(msgs);
        requestAnimationFrame(() => {
            container.style.opacity = '1';
        });
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
        const months = ['января','февраля','марта','апреля','мая','июня',
                        'июля','августа','сентября','октября','ноября','декабря'];
        const day = moscow.getDate(), mon = months[moscow.getMonth()];
        if (moscow.getFullYear() === now.getFullYear()) return `${day} ${mon}`;
        return `${day} ${mon} ${moscow.getFullYear()}`;
    } catch(e) { return null; }
}

function setupScrollPagination(){/* VirtualList handles it */}

// ══════════════════════════════════════════════════════════
//  РЕНДЕР СООБЩЕНИЯ
// ══════════════════════════════════════════════════════════
function buildMessageRow(msg, animate = true) {
    // FIX: never render a deleted message
    if (_deletedMsgIds && _deletedMsgIds.has(String(msg.id))) return null;
    const isMe = msg.sender_id === currentUser.id;
    const type = msg.type || msg.type_msg || 'text';
    const row  = document.createElement('div');
    row.className = `msg-row ${isMe ? 'out' : 'in'}`;
    // OPT Task 2c: content-visibility:auto defers paint for off-screen messages
    row.style.contentVisibility = 'auto';
    row.style.containIntrinsicSize = '0 72px'; // estimated height hint
    row.setAttribute('data-msg-id', msg.id || '');
    // FIX DUPLICATE: mark optimistic rows so onNewMessage cleanup finds them
    if (msg._optimistic) {
        row.dataset.optimistic = '1';
        row.dataset.content = msg.content || '';
    }
    if (animate) row.classList.add('animate-msg');

    // Долгое нажатие (мобайл)
    let lpTimer;
    row.addEventListener('touchstart', (e) => {
        if (e.touches && e.touches.length > 1) return;
        lpTimer = setTimeout(() => {
            if (document.querySelector('.msg-menu-overlay')) return;
            vibrate([10,30,10]);
            showMsgContextMenu(row, msg);
        }, 600);
    }, { passive: true });
    row.addEventListener('touchend',  () => clearTimeout(lpTimer), {passive:true});
    row.addEventListener('touchmove', () => clearTimeout(lpTimer), {passive:true});
    row.addEventListener('touchcancel', () => clearTimeout(lpTimer), {passive:true});

    // ПК: правый клик → компактное контекстное меню
    row.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showDesktopContextMenu(e.clientX, e.clientY, msg);
    });

    // ПК: hover эффект на сообщениях
    if (window.matchMedia('(hover:hover)').matches) {
        row.addEventListener('mouseenter', () => { row.style.background = 'rgba(255,255,255,0.03)'; });
        row.addEventListener('mouseleave', () => { row.style.background = ''; });
    }

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

    let contentHtml = '';
    if (type === 'call_audio' || type === 'call_video') {
        const _isMissed = !msg.content || msg.content === 'missed' || msg.content === '0' || +msg.content === 0;
        const _isVideo  = type === 'call_video';
        const _isMine   = +msg.sender_id === +currentUser.id;
        const _dur      = (!_isMissed && msg.content && !isNaN(+msg.content)) ? +msg.content : 0;
        const _durStr   = _dur > 0 ? fmtSec(_dur) : '';

        // цвет по типу
        const _clr  = _isMissed ? '#ff453a' : '#30d158';
        const _bg   = _isMissed ? 'rgba(255,69,58,0.10)' : 'rgba(48,209,88,0.08)';
        const _brd  = _isMissed ? 'rgba(255,69,58,0.20)' : 'rgba(48,209,88,0.18)';
        const _ibg  = _isMissed ? 'rgba(255,69,58,0.14)' : 'rgba(48,209,88,0.14)';

        const _label = _isMissed
            ? (_isMine ? 'Нет ответа' : 'Пропущенный')
            : (_isVideo ? 'Видеозвонок' : 'Звонок');

        const _ico = _isMissed
            ? `<svg width="19" height="19" viewBox="0 0 24 24" fill="none">
                 <path d="M10.68 13.31a16 16 0 003.41 2.6l1.27-1.27a2 2 0 012.11-.45 12 12 0 003.53.6A.83.83 0 0121.83 18v3.5a.83.83 0 01-.83.83C9.65 21 3 14.35 3 6.17a.83.83 0 01.83-.84h3.5a.83.83 0 01.83.83 12 12 0 00.6 3.53 2 2 0 01-.45 2.11z" stroke="${_clr}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                 <line x1="2" y1="2" x2="22" y2="22" stroke="${_clr}" stroke-width="2.2" stroke-linecap="round"/>
               </svg>`
            : _isVideo
            ? `<svg width="19" height="19" viewBox="0 0 24 24" fill="none">
                 <path d="M15 10l4.55-2.27A1 1 0 0121 8.68v6.64a1 1 0 01-1.45.9L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" stroke="${_clr}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
               </svg>`
            : `<svg width="19" height="19" viewBox="0 0 24 24" fill="none">
                 <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12 12 0 00.67 2.68 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12 12 0 002.68.67A2 2 0 0122 16.92z" stroke="${_clr}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
               </svg>`;

        const _callbackBtn = (_isMissed && !_isMine)
            ? `<button onclick="startCall('${_isVideo ? 'video' : 'audio'}')" style="
                margin-top:10px;width:100%;padding:9px 0;
                background:rgba(48,209,88,0.12);
                border:1px solid rgba(48,209,88,0.25);
                border-radius:14px;
                color:#30d158;font-size:13px;font-weight:700;
                cursor:pointer;font-family:inherit;
                display:flex;align-items:center;justify-content:center;gap:6px;
                -webkit-tap-highlight-color:transparent">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                  <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12 12 0 00.67 2.68 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12 12 0 002.68.67A2 2 0 0122 16.92z" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
                </svg>Перезвонить
              </button>`
            : '';

        contentHtml = `<div style="
            display:inline-flex;flex-direction:column;
            background:${_bg};
            border:1px solid ${_brd};
            border-radius:18px;
            padding:12px 14px;
            min-width:180px;max-width:230px">
          <div style="display:flex;align-items:center;gap:11px">
            <div style="width:38px;height:38px;border-radius:50%;background:${_ibg};flex-shrink:0;display:flex;align-items:center;justify-content:center">${_ico}</div>
            <div style="flex:1;min-width:0">
              <div style="font-size:14px;font-weight:700;color:${_clr};line-height:1.2">${_label}</div>
              ${_durStr
                ? `<div style="margin-top:3px;font-size:12px;color:rgba(255,255,255,0.38);display:flex;align-items:center;gap:4px">
                     <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.3)" stroke-width="2"/><path d="M12 7v5l3 2" stroke="rgba(255,255,255,0.3)" stroke-width="2" stroke-linecap="round"/></svg>
                     ${_durStr}
                   </div>`
                : `<div style="margin-top:3px;font-size:12px;color:rgba(255,255,255,0.35)">${_isMissed ? 'Не отвечено' : ''}</div>`
              }
            </div>
          </div>
          ${_callbackBtn}
        </div>`;
        } else if (type === 'image' || type === 'photo') {
        // FIXED: skeleton + retry + eager load для blob (optimistic UI)
        const _isSrc  = msg.file_url || '';
        const _isBlob = _isSrc.startsWith('blob:');
        const _skId = 'sk_' + (msg.id || Math.random().toString(36).slice(2));
        // FIX PHOTO FLASH: start visible if blob (already in memory) or already loaded once
        const _startOpacity = (_isBlob || (window._imgLoaded && window._imgLoaded.has(_isSrc))) ? '1' : '0';
        contentHtml = `<div class="img-bubble" style="position:relative;max-width:260px;min-height:40px;background:transparent;cursor:zoom-in;border-radius:14px;overflow:hidden;border:none;outline:none;box-shadow:none"
            onclick="openImgZoom(this.querySelector('img')?.src||'')">
            ${_startOpacity==='0'?`<div class="wc-img-sk" id="${_skId}"></div>`:''}
            <img src="${_isSrc}" loading="${_isBlob ? 'eager' : 'lazy'}" decoding="async"
                 style="display:block;width:100%;height:auto;max-height:320px;object-fit:cover;border-radius:14px;border:none;outline:none;box-shadow:none;opacity:${_startOpacity};transition:opacity 0.18s ease"
                 onload="(function(el){window._imgLoaded=window._imgLoaded||new Set();window._imgLoaded.add(el.src);const sk=document.getElementById('${_skId}');if(sk)sk.remove();el.style.opacity=1})(this)"
                 onerror="(function(img){const sk=document.getElementById('${_skId}');if(sk)sk.remove();let r=parseInt(img.dataset.retries||0);if(r<3){img.dataset.retries=r+1;setTimeout(()=>{img.src=img.src.split('?r=')[0]+'?r='+Date.now();},1500*Math.pow(2,r));}else{img.style.display='none';img.parentElement.innerHTML='<div style=\'padding:14px 16px;color:rgba(255,255,255,.35);font-size:13px;text-align:center\'>⚠️ Фото не загрузилось</div>';}})(this)">
            <div class="msg-media-time">${displayTime}${isMe ? `&nbsp;<span class="status-icon" style="color:${msg.is_read ? 'rgba(147,197,253,1)' : 'rgba(255,255,255,0.55)'};">${msg.is_read ? ICONS.checkDouble : ICONS.check}</span>` : ''}</div>
        </div>`;
    } else if (type === 'video') {
        // FIXED: preload=metadata для мгновенного thumb, controls видны сразу
        contentHtml = `<div style="overflow:hidden;border-radius:14px;max-width:260px;background:transparent;position:relative;border:none">
            <video src="${msg.file_url}" controls playsinline preload="metadata"
                   style="display:block;width:100%;max-height:380px;object-fit:cover;border:none;outline:none"
                   onerror="this.parentElement.innerHTML='<div style=\'padding:14px;color:rgba(255,255,255,.35);font-size:13px;text-align:center\'>⚠️ Видео недоступно</div>'"></video>
            <div class="msg-media-time">${displayTime}${isMe ? `&nbsp;<span class="status-icon" style="color:${msg.is_read ? 'rgba(147,197,253,1)' : 'rgba(255,255,255,0.55)'};">${msg.is_read ? ICONS.checkDouble : ICONS.check}</span>` : ''}</div>
        </div>`;
    } else if (type === 'file' || type === 'document') {
        const fname = msg.content || 'Файл';
        const furl  = msg.file_url || '';
        const ext   = (fname.split('.').pop() || '').toLowerCase();
        const iconMap = { pdf:'📄', doc:'📝', docx:'📝', xls:'📊', xlsx:'📊', zip:'🗜', rar:'🗜', mp3:'🎵', wav:'🎵' };
        const icon = iconMap[ext] || '📎';
        const fsize = msg.file_size ? ` · ${_formatFileSize(msg.file_size)}` : '';
        contentHtml = `<a href="${furl}" download="${fname}" target="_blank" rel="noopener"
            style="display:flex;align-items:center;gap:12px;padding:4px 2px;text-decoration:none;color:inherit;min-width:180px;max-width:260px">
            <div style="width:44px;height:44px;border-radius:12px;background:rgba(255,255,255,0.12);display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">${icon}</div>
            <div style="flex:1;min-width:0">
                <div style="font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(fname)}</div>
                <div style="font-size:11px;opacity:0.55;margin-top:2px">Нажмите для загрузки${fsize}</div>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style="flex-shrink:0;opacity:0.6"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5 5-5-5M12 3v13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </a>`;
    } else if (type === 'audio') {
        contentHtml = renderAudioPlayer(msg.file_url, displayTime, isMe, msg.is_read);
    } else {
        const text = msg.content || msg.text || '';
        const safe = text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        const linkedColor = isMe ? 'rgba(255,255,255,0.92)' : '#60a5fa';
        const linked = safe.replace(/(https?:\/\/[^\s<]+)/g,
            `<a href="$1" target="_blank" rel="noopener noreferrer"
                style="color:${linkedColor};text-decoration:none;border-bottom:1px solid ${linkedColor}40;word-break:break-all;font-weight:500">$1</a>`);
        const _statusIcon = isMe
            ? `<span class="status-icon" style="color:${msg.is_read ? '#93c5fd' : 'rgba(255,255,255,0.6)'};display:inline-flex;align-items:center;margin-left:2px;vertical-align:middle">${msg.is_read ? ICONS.checkDouble : ICONS.check}</span>`
            : '';
        // Telegram technique: ghost spacer + float time
        const _timeFloat = `<span style="float:right;margin-left:6px;margin-top:2px;font-size:10.5px;color:rgba(255,255,255,0.55);white-space:nowrap;display:inline-flex;align-items:center;gap:2px;line-height:1.2;vertical-align:bottom;position:relative;top:2px">${displayTime}${_statusIcon}</span>`;
        contentHtml = `<div style="white-space:pre-wrap;word-break:break-word;line-height:1.5;overflow:hidden">${_timeFloat}${linked}</div>`;
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
    if (!msg._optimistic) {
        const ck = currentChatType === 'group' ? `g_${currentPartnerId}` : `p_${currentPartnerId}`;
        if (messagesByChatCache[ck]) {
            messagesByChatCache[ck].messages.push(msg);
            clearTimeout(renderNewMessage._t);
            renderNewMessage._t = setTimeout(() => MsgDB.save(ck, messagesByChatCache[ck].messages), 1500);
        }
    }
    VirtualList.appendMessage(msg);
}

// ══════════════════════════════════════════════════════════
//  КОНТЕКСТНОЕ МЕНЮ СООБЩЕНИЯ
// ══════════════════════════════════════════════════════════
// ── iOS 26: контекстное меню сообщения ──────────────────
// ══════════════════════════════════════════════════════════════
//  DESKTOP CONTEXT MENU — правый клик на сообщении
// ══════════════════════════════════════════════════════════════
function showDesktopContextMenu(x, y, msg) {
    document.getElementById('_wc_dctx')?.remove();

    const isMe   = +msg.sender_id === +currentUser.id;
    const isText = !msg.type || msg.type === 'text';
    const text   = isText ? (msg.content || msg.text || '') : '';
    const EMOJIS = ['❤️','😂','😮','😢','👍','🔥','💯','🎉'];

    const menu = document.createElement('div');
    menu.id = '_wc_dctx';
    menu.style.cssText = [
        'position:fixed',
        `left:${x}px`,
        `top:${y}px`,
        'z-index:99998',
        'background:rgba(28,28,34,0.97)',
        'backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px)',
        'border:.5px solid rgba(255,255,255,0.1)',
        'border-radius:14px',
        'box-shadow:0 8px 40px rgba(0,0,0,0.6),0 2px 8px rgba(0,0,0,0.4)',
        'padding:5px',
        'min-width:200px',
        'animation:_dctx_in 0.12s cubic-bezier(0.34,1.56,0.64,1)',
        'transform-origin:top left',
        'user-select:none',
    ].join(';');

    // Анимация появления
    if (!document.getElementById('_dctx_css')) {
        const s = document.createElement('style');
        s.id = '_dctx_css';
        s.textContent = `
            @keyframes _dctx_in {
                from { opacity:0; transform:scale(0.88) translateY(-4px); }
                to   { opacity:1; transform:scale(1) translateY(0); }
            }
            #_wc_dctx ._mi {
                display:flex; align-items:center; gap:10px;
                padding:7px 10px; border-radius:9px; cursor:pointer;
                font-size:13.5px; font-weight:500; color:rgba(255,255,255,0.88);
                transition:background 0.1s; white-space:nowrap;
            }
            #_wc_dctx ._mi:hover { background:rgba(255,255,255,0.08); }
            #_wc_dctx ._mi:active { background:rgba(255,255,255,0.12); }
            #_wc_dctx ._mi-icon {
                width:28px; height:28px; border-radius:7px;
                display:flex; align-items:center; justify-content:center;
                flex-shrink:0; font-size:15px;
            }
            #_wc_dctx ._sep {
                height:.5px; background:rgba(255,255,255,0.07);
                margin:4px 8px;
            }
            #_wc_dctx ._reaction-row {
                display:flex; align-items:center; gap:2px;
                padding:4px 6px 6px; border-bottom:.5px solid rgba(255,255,255,0.07);
                margin-bottom:3px;
            }
            #_wc_dctx ._rbtn {
                font-size:20px; padding:3px 4px; background:none; border:none;
                cursor:pointer; border-radius:7px; transition:all 0.12s;
                line-height:1;
            }
            #_wc_dctx ._rbtn:hover {
                background:rgba(255,255,255,0.1);
                transform:scale(1.25) translateY(-2px);
            }
        `;
        document.head.appendChild(s);
    }

    const close = () => {
        menu.style.animation = 'none';
        menu.style.opacity   = '0';
        menu.style.transform = 'scale(0.92)';
        menu.style.transition = 'opacity 0.1s,transform 0.1s';
        setTimeout(() => menu.remove(), 110);
    };

    // Автоматическое позиционирование — не выходить за экран
    requestAnimationFrame(() => {
        const r  = menu.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        if (r.right  > vw - 8) menu.style.left = (vw - r.width  - 8) + 'px';
        if (r.bottom > vh - 8) menu.style.top  = (y - r.height - 4)  + 'px';
    });

    // ── Реакции ──────────────────────────────────────────────
    const rRow = document.createElement('div');
    rRow.className = '_reaction-row';
    EMOJIS.forEach(em => {
        const b = document.createElement('button');
        b.className = '_rbtn';
        b.textContent = em;
        b.title = em;
        b.onclick = () => {
            activeReactionMsgId = msg.id;
            sendReaction(em);
            close();
        };
        rRow.appendChild(b);
    });
    menu.appendChild(rRow);

    // ── Пункты меню ──────────────────────────────────────────
    const addItem = (icon, iconBg, label, color, action, danger) => {
        const item = document.createElement('div');
        item.className = '_mi';
        if (danger) item.style.color = danger;
        item.innerHTML = `
            <div class="_mi-icon" style="background:${iconBg}">${icon}</div>
            <span>${label}</span>`;
        item.onclick = () => { close(); setTimeout(action, 80); };
        menu.appendChild(item);
    };

    const addSep = () => {
        const d = document.createElement('div');
        d.className = '_sep';
        menu.appendChild(d);
    };

    // Копировать текст
    if (text) {
        addItem(
            `<svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <rect x="9" y="9" width="13" height="13" rx="2" stroke="#5e9cf5" stroke-width="2"/>
              <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" stroke="#5e9cf5" stroke-width="2" stroke-linecap="round"/>
            </svg>`,
            'rgba(94,156,245,0.15)', 'Копировать', null,
            () => copyMessage(text)
        );
    }

    // Ответить
    addItem(
        `<svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path d="M3 10h10a8 8 0 018 8v2M3 10l6 6M3 10l6-6" stroke="#34d399" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`,
        'rgba(52,211,153,0.15)', 'Ответить', null,
        () => {
            if (typeof _setReplyMsg === 'function') _setReplyMsg(msg);
            else { const inp = document.getElementById('msg-input'); if (inp) inp.focus(); }
        }
    );

    // Переслать
    addItem(
        `<svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <polyline points="15 17 20 12 15 7" stroke="#a78bfa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M4 18v-2a6 6 0 016-6h10" stroke="#a78bfa" stroke-width="2" stroke-linecap="round"/>
        </svg>`,
        'rgba(167,139,250,0.15)', 'Переслать', null,
        () => _forwardMessage(msg)
    );

    // Выбрать
    addItem(
        `<svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="3" width="18" height="18" rx="4" stroke="#f59e0b" stroke-width="2"/>
          <polyline points="8,12 11,15 16,9" stroke="#f59e0b" stroke-width="2" stroke-linecap="round"/>
        </svg>`,
        'rgba(245,158,11,0.15)', 'Выбрать', null,
        () => _startMultiSelect(msg.id)
    );

    addSep();

    // Удалить у меня
    addItem(
        `<svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke="#f5a623" stroke-width="2" stroke-linecap="round"/>
        </svg>`,
        'rgba(245,166,35,0.15)', 'Удалить у меня', '#f5a623',
        () => _deleteMsgForMe(msg.id)
    );

    // Удалить у всех (только автор)
    if (isMe) {
        addItem(
            `<svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke="#ff453a" stroke-width="2" stroke-linecap="round"/>
            </svg>`,
            'rgba(255,69,58,0.15)', 'Удалить у всех', '#ff453a',
            () => _confirmDeleteForAll(msg.id)
        );
    }

    document.body.appendChild(menu);

    // Закрываем по клику вне / Escape / scroll
    const onDown = (e) => {
        if (!menu.contains(e.target)) { close(); cleanup(); }
    };
    const onKey  = (e) => {
        if (e.key === 'Escape') { close(); cleanup(); }
    };
    const onScroll = () => { close(); cleanup(); };
    const cleanup  = () => {
        document.removeEventListener('mousedown', onDown);
        document.removeEventListener('keydown',   onKey);
        window.removeEventListener('scroll', onScroll, true);
    };
    setTimeout(() => {
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown',   onKey);
        window.addEventListener('scroll', onScroll, { capture:true, once:true });
    }, 10);
}

function showMsgContextMenu(row, msg) {
    // Убираем предыдущее меню если открыто
    document.getElementById('_wc_ctx')?.remove();

    const isMe  = +msg.sender_id === +currentUser.id;
    const isText = !msg.type || msg.type === 'text';
    const text   = isText ? (msg.content || msg.text || '') : '';
    const EMOJIS = ['❤️','😂','😮','😢','👍','🔥','💯','🎉','🥰','😱','👎','🫡'];

    // ── Overlay (затемнение + blur) ──
    const ov = document.createElement('div');
    ov.id = '_wc_ctx';
    ov.className = 'msg-menu-overlay'; // FIX FREEZE: class needed for duplicate-open guard
    ov.style.cssText = [
        'position:fixed;inset:0;z-index:9100',
        'background:rgba(0,0,0,0.52)',
        'backdrop-filter:blur(7px);-webkit-backdrop-filter:blur(7px)',
        'display:flex;align-items:flex-end;justify-content:center',
    ].join(';');

    // ── Sheet ──
    const sh = document.createElement('div');
    sh.style.cssText = [
        'width:100%;max-width:500px',
        'background:rgba(22,22,28,0.98)',
        'border-radius:26px 26px 0 0',
        'border-top:0.5px solid rgba(255,255,255,0.09)',
        'overflow:hidden',
        'padding-bottom:18px',
        'transform:translateY(100%)',
        'transition:transform 0.3s cubic-bezier(.32,.72,0,1)',
    ].join(';');

    const close = () => {
        sh.style.transform = 'translateY(100%)';
        ov.style.opacity   = '0';
        ov.style.transition = 'opacity 0.26s';
        // FIX FREEZE: use pointer-events:none during animation, then remove entirely
        ov.style.pointerEvents = 'none';
        setTimeout(() => { ov.remove(); }, 280);
    };
    ov.addEventListener('pointerdown', e => { if (e.target === ov) close(); });

    // ── Ручка ──
    sh.innerHTML = `<div style="padding:10px 0 2px;display:flex;justify-content:center">
        <div style="width:36px;height:4px;border-radius:2px;background:rgba(255,255,255,0.13)"></div>
    </div>`;

    // ── Превью текста ──
    if (text) {
        const prev = document.createElement('div');
        prev.style.cssText = [
            'margin:6px 14px 10px',
            'padding:10px 13px',
            'background:rgba(255,255,255,0.04)',
            'border:0.5px solid rgba(255,255,255,0.07)',
            'border-radius:14px',
            'font-size:13.5px;line-height:1.45',
            'color:rgba(255,255,255,0.45)',
            'max-height:52px;overflow:hidden',
        ].join(';');
        prev.textContent = text.length > 85 ? text.slice(0,85)+'…' : text;
        sh.appendChild(prev);
    }

    // ── Реакции — горизонтальная полоса ──
    const rWrap = document.createElement('div');
    rWrap.style.cssText = 'display:flex;justify-content:space-around;align-items:center;padding:4px 8px 10px;border-bottom:0.5px solid rgba(255,255,255,0.06)';
    EMOJIS.slice(0, 8).forEach(em => {
        const b = document.createElement('button');
        b.style.cssText = 'font-size:29px;padding:5px 3px;background:none;border:none;cursor:pointer;transition:transform 0.14s;-webkit-tap-highlight-color:transparent';
        b.textContent = em;
        b.addEventListener('pointerdown', () => { b.style.transform='scale(1.38) translateY(-5px)'; });
        b.addEventListener('pointerup',   () => { b.style.transform=''; });
        b.addEventListener('click', () => {
            activeReactionMsgId = msg.id;
            sendReaction(em);
            close();
        });
        rWrap.appendChild(b);
    });
    sh.appendChild(rWrap);

    // ── Вспомогательная функция строки действия ──
    const mkRow = (iconSvg, iconBg, label, labelColor, sublabel, onClick) => {
        const r = document.createElement('div');
        r.style.cssText = [
            'display:flex;align-items:center;gap:13px',
            'padding:13px 16px',
            'cursor:pointer',
            '-webkit-tap-highlight-color:transparent',
            'transition:background 0.1s',
        ].join(';');
        r.innerHTML = `
            <div style="width:38px;height:38px;border-radius:12px;background:${iconBg};display:flex;align-items:center;justify-content:center;flex-shrink:0">${iconSvg}</div>
            <div style="flex:1;min-width:0">
                <div style="font-size:15px;font-weight:600;color:${labelColor};letter-spacing:-0.1px">${label}</div>
                ${sublabel ? `<div style="font-size:12px;margin-top:2px;color:rgba(255,255,255,0.3)">${sublabel}</div>` : ''}
            </div>`;
        r.addEventListener('pointerdown', () => r.style.background='rgba(255,255,255,0.05)');
        r.addEventListener('pointerup',   () => r.style.background='');
        r.addEventListener('click', () => { close(); setTimeout(onClick, 55); });
        return r;
    };

    const actWrap = document.createElement('div');
    actWrap.style.cssText = 'padding:6px 0 0';

    // Переслать сообщение
    actWrap.appendChild(mkRow(
        `<svg width="17" height="17" viewBox="0 0 24 24" fill="none">
          <polyline points="15 10 20 5 15 0" stroke="#34d399" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" transform="translate(0,7)"/>
          <path d="M4 12v-2a6 6 0 016-6h10" stroke="#34d399" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`,
        'rgba(52,211,153,0.14)', 'Переслать', '#34d399', null,
        () => _forwardMessage(msg)
    ));
    const dFwd = document.createElement('div');
    dFwd.style.cssText = 'height:0.5px;background:rgba(255,255,255,0.06);margin:2px 16px';
    actWrap.appendChild(dFwd);

    // Выбрать (мультиселект)
    actWrap.appendChild(mkRow(
        `<svg width="17" height="17" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="3" width="18" height="18" rx="4" stroke="#a78bfa" stroke-width="2"/>
          <polyline points="8,12 11,15 16,9" stroke="#a78bfa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`,
        'rgba(167,139,250,0.14)', 'Выбрать', '#a78bfa', 'Выделить несколько сообщений',
        () => _startMultiSelect(msg.id)
    ));
    const dSel = document.createElement('div');
    dSel.style.cssText = 'height:0.5px;background:rgba(255,255,255,0.06);margin:2px 16px';
    actWrap.appendChild(dSel);

    // Копировать (только текст)
    if (text) {
        actWrap.appendChild(mkRow(
            `<svg width="17" height="17" viewBox="0 0 24 24" fill="none">
              <rect x="9" y="9" width="13" height="13" rx="2" stroke="#5e9cf5" stroke-width="2"/>
              <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" stroke="#5e9cf5" stroke-width="2" stroke-linecap="round"/>
            </svg>`,
            'rgba(94,156,245,0.14)', 'Копировать', '#5e9cf5', null,
            () => copyMessage(text)
        ));
        // тонкий разделитель
        const d = document.createElement('div');
        d.style.cssText = 'height:0.5px;background:rgba(255,255,255,0.06);margin:2px 16px';
        actWrap.appendChild(d);
    }

    // Удалить у меня — ВСЕГДА (и своё и чужое)
    actWrap.appendChild(mkRow(
        `<svg width="17" height="17" viewBox="0 0 24 24" fill="none">
          <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke="#f5a623" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M10 11v6M14 11v6" stroke="#f5a623" stroke-width="2" stroke-linecap="round"/>
        </svg>`,
        'rgba(245,166,35,0.14)', 'Удалить у меня', '#f5a623',
        'Только ты не увидишь это сообщение',
        () => _deleteMsgForMe(msg.id)
    ));

    // Удалить у всех — только автор сообщения
    if (isMe) {
        const d2 = document.createElement('div');
        d2.style.cssText = 'height:0.5px;background:rgba(255,255,255,0.06);margin:2px 16px';
        actWrap.appendChild(d2);

        actWrap.appendChild(mkRow(
            `<svg width="17" height="17" viewBox="0 0 24 24" fill="none">
              <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke="#ff453a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M10 11v6M14 11v6" stroke="#ff453a" stroke-width="2" stroke-linecap="round"/>
            </svg>`,
            'rgba(255,69,58,0.14)', 'Удалить у всех', '#ff453a',
            'Исчезнет у всех прямо сейчас',
            () => _confirmDeleteForAll(msg.id)
        ));
    }

    sh.appendChild(actWrap);
    ov.appendChild(sh);
    document.body.appendChild(ov);
    requestAnimationFrame(() => requestAnimationFrame(() => { sh.style.transform = 'translateY(0)'; }));
}

function openImgZoom(src) {
    if (!src) return;
    let viewer = document.getElementById('wc-img-viewer');
    if (!viewer) {
        viewer = document.createElement('div');
        viewer.id = 'wc-img-viewer';
        viewer.innerHTML = `
            <button id="wc-img-viewer-close" aria-label="Закрыть" onclick="closeImgZoom()">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="white" stroke-width="2.5" stroke-linecap="round"/></svg>
            </button>
            <a id="wc-img-dl" download="photo.jpg" style="position:absolute;top:max(env(safe-area-inset-top,0px),12px);right:60px;width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,0.12);backdrop-filter:blur(8px);border:0.5px solid rgba(255,255,255,0.2);display:flex;align-items:center;justify-content:center;cursor:pointer;-webkit-tap-highlight-color:transparent">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </a>
            <img id="wc-img-viewer-img" src="" alt="" draggable="false">`;
        document.body.appendChild(viewer);
        viewer.addEventListener('click', function(e) { if (e.target === viewer) closeImgZoom(); });
    }
    const img = viewer.querySelector('#wc-img-viewer-img');
    const dl  = viewer.querySelector('#wc-img-dl');
    img.src = src;
    if (dl) dl.href = src;
    viewer.classList.add('open');
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') { closeImgZoom(); document.removeEventListener('keydown', onKey); } };
    document.addEventListener('keydown', onKey);
    // Swipe down to close
    let _sy = 0, _dragging = false;
    const onTS = (e) => { _sy = e.touches[0].clientY; _dragging = true; };
    const onTM = (e) => {
        if (!_dragging) return;
        const dy = e.touches[0].clientY - _sy;
        const dx = Math.abs(e.touches[0].clientX - (e.touches[0].clientX));
        if (dy > 0) {
            const prog = Math.min(dy / 250, 1);
            img.style.transform = `translateY(${dy * 0.5}px) scale(${1 - prog * 0.15})`;
            viewer.style.background = `rgba(0,0,0,${0.96 - prog * 0.5})`;
        }
    };
    const onTE = (e) => {
        if (!_dragging) return; _dragging = false;
        const dy = e.changedTouches[0].clientY - _sy;
        if (dy > 90) { closeImgZoom(); }
        else { img.style.transform = ''; viewer.style.background = ''; }
    };
    viewer.addEventListener('touchstart', onTS, { passive: true });
    viewer.addEventListener('touchmove',  onTM, { passive: true });
    viewer.addEventListener('touchend',   onTE);
    viewer._cleanup = () => {
        viewer.removeEventListener('touchstart', onTS);
        viewer.removeEventListener('touchmove', onTM);
        viewer.removeEventListener('touchend', onTE);
    };
}

function closeImgZoom() {
    const viewer = document.getElementById('wc-img-viewer');
    if (!viewer) return;
    const img = viewer.querySelector('#wc-img-viewer-img');
    if (img) img.style.transform = '';
    viewer.style.background = '';
    viewer.classList.remove('open');
    document.body.style.overflow = '';
    if (viewer._cleanup) { viewer._cleanup(); viewer._cleanup = null; }
}

function copyMessage(text) {
    navigator.clipboard?.writeText(text).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = text; document.body.appendChild(ta); ta.select();
        document.execCommand('copy'); ta.remove();
    });
    showToast('Скопировано', 'success'); vibrate(15);
}

// ═══ МУЛЬТИСЕЛЕКТ СООБЩЕНИЙ ═══
let _multiSelectActive = false;
let _selectedMsgIds    = new Set();

function _startMultiSelect(firstMsgId) {
    _multiSelectActive = true;
    _selectedMsgIds.clear();
    _toggleMsgSelect(firstMsgId, true);
    _showMultiSelectBar();
    // Включаем tap-to-select на всех строках
    document.querySelectorAll('.msg-row').forEach(r => {
        r.style.cursor = 'pointer';
        r._origLpTimer = r._origLpTimer || null;
    });
}

function _toggleMsgSelect(msgId, forceOn) {
    const row = document.querySelector(`[data-msg-id="${msgId}"]`);
    if (!row) return;
    if (forceOn || !_selectedMsgIds.has(msgId)) {
        _selectedMsgIds.add(msgId);
        row.style.background = 'rgba(167,139,250,0.15)';
        row.style.borderRadius = '12px';
        // Добавляем чекбокс
        if (!row.querySelector('._sel_check')) {
            const chk = document.createElement('div');
            chk.className = '_sel_check';
            chk.style.cssText = 'width:22px;height:22px;border-radius:50%;background:var(--accent);display:flex;align-items:center;justify-content:center;flex-shrink:0;order:-1;margin-right:4px';
            chk.innerHTML = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><polyline points="2,6 5,9 10,3" stroke="#000" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
            row.style.display = 'flex'; row.style.alignItems = 'center';
            row.insertBefore(chk, row.firstChild);
        }
    } else {
        _selectedMsgIds.delete(msgId);
        row.style.background = '';
        row.style.borderRadius = '';
        row.querySelector('._sel_check')?.remove();
    }
    // Обновляем счётчик
    const bar = document.getElementById('_multiselect_bar');
    if (bar) {
        bar.querySelector('#_ms_count').textContent = `Выбрано: ${_selectedMsgIds.size}`;
        bar.querySelector('#_ms_del').style.opacity = _selectedMsgIds.size ? '1' : '0.4';
    }
}

function _showMultiSelectBar() {
    document.getElementById('_multiselect_bar')?.remove();
    const bar = document.createElement('div');
    bar.id = '_multiselect_bar';
    bar.style.cssText = [
        'position:fixed;bottom:0;left:0;right:0;z-index:8000',
        'background:rgba(22,22,28,0.97);backdrop-filter:blur(20px)',
        'border-top:0.5px solid rgba(255,255,255,0.1)',
        'padding:12px 16px;padding-bottom:12px',
        'display:flex;align-items:center;gap:12px',
    ].join(';');
    bar.innerHTML = `
        <button onclick="_cancelMultiSelect()" style="padding:9px 14px;background:rgba(255,255,255,.08);border:none;border-radius:12px;color:#fff;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit">Отмена</button>
        <span id="_ms_count" style="flex:1;font-size:14px;color:rgba(255,255,255,.6);text-align:center">Выбрано: 1</span>
        <button id="_ms_del" onclick="_deleteSelected()" style="padding:9px 16px;background:rgba(255,69,58,.15);border:none;border-radius:12px;color:#ff453a;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit">Удалить</button>`;
    document.body.appendChild(bar);

    // Клик по сообщению = выбор/снятие
    document.querySelectorAll('.msg-row').forEach(row => {
        row._msHandler = (e) => {
            if (!_multiSelectActive) return;
            e.stopPropagation();
            const id = row.getAttribute('data-msg-id');
            if (id) _toggleMsgSelect(id);
        };
        row.addEventListener('click', row._msHandler);
    });
}

function _cancelMultiSelect() {
    _multiSelectActive = false;
    _selectedMsgIds.forEach(id => {
        const row = document.querySelector(`[data-msg-id="${id}"]`);
        if (row) { row.style.background=''; row.style.borderRadius=''; row.querySelector('._sel_check')?.remove(); }
    });
    _selectedMsgIds.clear();
    document.getElementById('_multiselect_bar')?.remove();
    document.querySelectorAll('.msg-row').forEach(r => {
        if (r._msHandler) r.removeEventListener('click', r._msHandler);
        r.style.cursor = '';
    });
}

async function _deleteSelected() {
    if (!_selectedMsgIds.size) return;
    const ids = [..._selectedMsgIds];
    // Анимируем удаление
    ids.forEach(id => _animDeleteMsgRow(id));
    // Отправляем удаление
    ids.forEach(id => socket.emit('delete_message_for_me', { msg_id: parseInt(id), chat_id: currentChatId }));
    showToast(`Удалено: ${ids.length}`, 'success');
    _cancelMultiSelect();
}

// ── Анимация схлопывания строки сообщения ──
function _animDeleteMsgRow(msgId) {
    const el = document.querySelector(`[data-msg-id="${msgId}"]`);
    if (!el) return;
    el.dataset.deleted = '1';
    const h = el.offsetHeight;
    el.style.overflow   = 'hidden';
    el.style.transition = 'opacity 0.18s ease, transform 0.18s ease, filter 0.18s ease';
    el.style.opacity    = '0';
    el.style.transform  = 'scale(0.9) translateX(6px)';
    el.style.filter     = 'blur(2px)';
    // Phase 2: collapse height
    el.style.maxHeight = h + 'px';
    setTimeout(() => {
        el.style.transition = 'max-height 0.22s ease, margin 0.22s ease, padding 0.22s ease';
        el.style.maxHeight    = '0';
        el.style.marginTop    = '0';
        el.style.marginBottom = '0';
        el.style.paddingTop   = '0';
        el.style.paddingBottom= '0';
        setTimeout(() => el.remove(), 230);
    }, 180);
}

// ── Удалить у меня ──
function _deleteMsgForMe(msgId) {
    _markMsgDeleted(msgId);   // FIX FREEZE: mark BEFORE animating so VirtualList skips on re-render
    _animDeleteMsgRow(msgId);
    socket.emit('delete_message_for_me', { msg_id: msgId, chat_id: currentChatId });
}

// ── Удалить у всех — confirm sheet ──
function _confirmDeleteForAll(msgId) {
    const ov = document.createElement('div');
    ov.style.cssText = [
        'position:fixed;inset:0;z-index:9200',
        'background:rgba(0,0,0,0.6)',
        'backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)',
        'display:flex;align-items:flex-end;justify-content:center',
    ].join(';');

    const sh = document.createElement('div');
    sh.style.cssText = [
        'width:100%;max-width:500px',
        'background:rgba(22,22,28,0.98)',
        'border-radius:26px 26px 0 0',
        'padding:0 16px max(20px,28px)',
        'border-top:0.5px solid rgba(255,255,255,0.09)',
        'transform:translateY(100%)',
        'transition:transform 0.3s cubic-bezier(.32,.72,0,1)',
    ].join(';');

    const closeConf = () => {
        sh.style.transform = 'translateY(100%)';
        ov.style.opacity   = '0'; ov.style.transition='opacity 0.24s';
        setTimeout(() => ov.remove(), 260);
    };
    ov.addEventListener('pointerdown', e => { if (e.target === ov) closeConf(); });

    sh.innerHTML = `
        <div style="padding:10px 0 4px;display:flex;justify-content:center">
            <div style="width:36px;height:4px;border-radius:2px;background:rgba(255,255,255,0.13)"></div>
        </div>
        <div style="text-align:center;padding:16px 0 22px">
            <div style="width:58px;height:58px;border-radius:50%;background:rgba(255,69,58,0.14);display:flex;align-items:center;justify-content:center;margin:0 auto 14px">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
                  <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke="#ff453a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  <path d="M10 11v6M14 11v6" stroke="#ff453a" stroke-width="2" stroke-linecap="round"/>
                </svg>
            </div>
            <div style="font-size:20px;font-weight:800;letter-spacing:-0.3px;margin-bottom:8px">Удалить у всех?</div>
            <div style="font-size:14px;color:rgba(255,255,255,0.4);line-height:1.55">Сообщение исчезнет у тебя<br>и у собеседника мгновенно</div>
        </div>
        <button id="_dfa_ok" style="
            width:100%;padding:15px;
            background:#ff453a;border:none;border-radius:16px;
            color:#fff;font-size:16px;font-weight:800;
            cursor:pointer;font-family:inherit;margin-bottom:10px;
            -webkit-tap-highlight-color:transparent">
            Удалить у всех
        </button>
        <button id="_dfa_no" style="
            width:100%;padding:14px;
            background:rgba(255,255,255,0.07);border:none;border-radius:16px;
            color:rgba(255,255,255,0.6);font-size:15px;font-weight:600;
            cursor:pointer;font-family:inherit;
            -webkit-tap-highlight-color:transparent">
            Отмена
        </button>`;

    sh.querySelector('#_dfa_ok').addEventListener('click', () => {
        closeConf();
        _markMsgDeleted(msgId);
        _animDeleteMsgRow(msgId);
        socket.emit('delete_message', { msg_id: msgId, chat_id: currentChatId });
    });
    sh.querySelector('#_dfa_no').addEventListener('click', closeConf);

    ov.appendChild(sh);
    document.body.appendChild(ov);
    requestAnimationFrame(() => requestAnimationFrame(() => { sh.style.transform = 'translateY(0)'; }));
}

// Совместимость со старым кодом
function confirmDeleteMessage(msgId) { _confirmDeleteForAll(msgId); }

// ══════════════════════════════════════════════════════════
//  АУДИО ПЛЕЕР — с волновой формой
// ══════════════════════════════════════════════════════════
// Waveform height cache — no re-fetch on chat re-open
const _wvCache = new Map(); // waveform height cache keyed by src URL

function renderAudioPlayer(src, displayTime, isMe, isRead) {
    const uid = `au_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;

    // Status icon (mountain)
    const _statusIcon = isMe
        ? `<span class="status-icon" style="color:${isRead ? '#93c5fd' : 'rgba(255,255,255,0.6)'};display:inline-flex;align-items:center;vertical-align:middle">${isRead ? ICONS.checkDouble : ICONS.check}</span>`
        : '';

    // Initial bars — use cache if available, else random placeholders
    const _cached = _wvCache.get(src);
    const _bars = (_cached
        ? _cached.map(h => `<div style="width:2px;background:rgba(255,255,255,${0.25+(h/26)*0.5});border-radius:1px;height:${h}px;transition:background 0.1s"></div>`)
        : Array(30).fill(0).map(() => `<div style="width:2px;background:rgba(255,255,255,0.25);border-radius:1px;height:${Math.max(3,Math.floor(Math.random()*16))}px;transition:background 0.1s"></div>`)
    ).join('');

    return `
    <div class="audio-player" data-src="${src}" style="min-width:190px;max-width:250px">
        <button class="audio-play-btn" onclick="toggleAudio('${uid}')">
            <svg id="play-icon-${uid}" width="14" height="14" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        </button>
        <div class="audio-progress-wrap" style="flex:1;min-width:0">
            <div class="audio-waveform" id="wv_${uid}" style="display:flex;align-items:center;gap:1.5px;height:24px;flex:1;cursor:pointer" onclick="seekAudio(event,'${uid}')">
                ${_bars}
            </div>
            <div style="display:flex;align-items:center;justify-content:space-between;margin-top:2px">
                <div class="audio-dur" id="dur_${uid}" style="font-size:11px;color:rgba(255,255,255,0.55);line-height:1">0:00</div>
                <div style="font-size:10.5px;color:rgba(255,255,255,0.55);display:inline-flex;align-items:center;gap:2px;line-height:1">${displayTime || ''}${_statusIcon}</div>
            </div>
        </div>
        <audio id="${uid}" src="${src}"
            ontimeupdate="updateAudio('${uid}')"
            onended="onAudioEnd('${uid}')"
            onloadedmetadata="setAudioDur('${uid}');_loadWaveform('${uid}','${src}')"></audio>
    </div>`;
}


async function _loadWaveform(uid, src) {
    setAudioDur(uid);
    if (_wvCache.has(src)) { _applyWvBars(uid, _wvCache.get(src)); return; }
    try {
        const r = await fetch(src, { cache: 'force-cache' });
        if (!r.ok) return;
        const buf     = await r.arrayBuffer();
        const actx    = new (window.AudioContext || window.webkitAudioContext)();
        const decoded = await actx.decodeAudioData(buf);
        actx.close();
        const data = decoded.getChannelData(0);
        const N    = 30;
        const step = Math.floor(data.length / N);
        const hs   = [];
        for (let i = 0; i < N; i++) {
            let mx = 0;
            for (let j = 0; j < step; j++) {
                const v = Math.abs(data[i*step+j]||0);
                if (v > mx) mx = v;
            }
            hs.push(Math.max(3, Math.round(mx * 26)));
        }
        _wvCache.set(src, hs);
        _applyWvBars(uid, hs);
    } catch(e) {}
}

function _applyWvBars(uid, hs) {
    const wv = document.getElementById('wv_' + uid);
    if (!wv) return;
    wv.querySelectorAll('div').forEach((bar, i) => {
        const h = hs[i] || 3;
        bar.style.height     = h + 'px';
        bar.style.background = 'rgba(255,255,255,' + (0.25 + (h/26)*0.5) + ')';
    });
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
        <a href="${src}" download style="position:absolute;bottom:max(20px,0px);left:50%;transform:translateX(-50%);background:rgba(255,255,255,0.1);border:none;color:white;font-size:13px;padding:10px 20px;border-radius:20px;text-decoration:none">⬇ Сохранить</a>`;
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
    if (!bar) return;

    // БАГ 1 FIX: Один пользователь — одна реакция
    // Если это моя реакция — снимаем предыдущую мою
    if (isMe) {
        bar.querySelectorAll('.reaction-chip.mine').forEach(prev => {
            if (prev.dataset.emoji !== emoji) {
                // Уменьшаем счётчик или удаляем
                const cnt = prev.querySelector('.rcnt');
                const n = parseInt(cnt?.textContent || '1') - 1;
                if (n <= 0) prev.remove();
                else { if (cnt) cnt.textContent = n; prev.classList.remove('mine'); }
            }
        });
    }

    const existing = bar.querySelector(`[data-emoji="${CSS.escape(emoji)}"]`);
    if (existing) {
        const cnt = existing.querySelector('.rcnt');
        // Если уже моя — это toggle (сервер удалит)
        if (isMe && existing.classList.contains('mine')) {
            const n = parseInt(cnt?.textContent || '1') - 1;
            if (n <= 0) existing.remove();
            else { if (cnt) cnt.textContent = n; existing.classList.remove('mine'); }
            return;
        }
        const newCount = parseInt(cnt?.textContent || '1') + 1;
        if (cnt) cnt.textContent = newCount;
        if (isMe) existing.classList.add('mine');
        existing.style.transform = 'scale(1.3)';
        setTimeout(() => { existing.style.transform = ''; }, 200);
    } else {
        const chip = document.createElement('div');
        chip.className = `reaction-chip${isMe ? ' mine' : ''}`;
        chip.dataset.emoji = emoji;
        chip.style.animation = 'reactionIn .25s cubic-bezier(.34,1.56,.64,1)';
        const span = document.createElement('span'); span.textContent = emoji;
        const cnt  = document.createElement('span'); cnt.className = 'rcnt'; cnt.textContent = '1';
        chip.appendChild(span); chip.appendChild(cnt);
        chip.addEventListener('click', () => { activeReactionMsgId = msgId; sendReaction(emoji); });
        bar.appendChild(chip);
    }
    if (!document.getElementById('reaction-anim-style')) {
        const st = document.createElement('style'); st.id = 'reaction-anim-style';
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

async function sendText() {
    const input = document.getElementById('msg-input');
    const text  = (input?.value || '').trim();
    if (!text) return;
    if (_sendInFlight) return;
    const _sendNow = Date.now();
    if (_lastSendSig.chatId === currentChatId && _lastSendSig.text === text && (_sendNow - _lastSendSig.ts) < 700) return;
    _sendInFlight = true;
    _lastSendSig = { chatId: currentChatId, text, ts: _sendNow };

    // Если чата ещё нет (первое сообщение после удаления или новый диалог) — создаём
    if (!currentChatId && currentPartnerId) {
        try {
            const r = await apiFetch(`/create_chat/${currentPartnerId}`, { method: 'POST' });
            if (!r?.ok) { showToast('Ошибка создания чата', 'error'); _sendInFlight = false; return; }
            const d = await r.json();
            if (!d.chat_id) { showToast('Ошибка создания чата', 'error'); _sendInFlight = false; return; }
            currentChatId = d.chat_id;
            socket.emit('enter_chat', { chat_id: currentChatId });
            // Партнёр больше не "удалённый"
            if (_deletedPartnerIds.has(currentPartnerId)) {
                _deletedPartnerIds.delete(currentPartnerId);
                _persistDeletedPartnerIds();
            }
            _deletedChatIds.delete(d.chat_id);
            _persistDeletedChatIds();
        } catch(e) {
            showToast('Нет соединения', 'error');
            _sendInFlight = false;
            return;
        }
    }

    if (!currentChatId) { _sendInFlight = false; return; }

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

    // FIX Task 5f: queue message if socket is disconnected
    const _msgPayload = {
        chat_id:   currentChatId,
        content:   text,
        type_msg:  'text',
        sender_id: currentUser.id,
        client_msg_id: tempMsg.id,
    };
    if (wsConnected) {
        // OPT Task 5c: emit with ACK — server returns {ok, msg_id}
        socket.timeout(5000).emit('send_message', _msgPayload, (err, ack) => {
            if (!err && ack && ack.msg_id) {
                // Replace tempId with real id in DOM
                const tempEl = document.querySelector(`[data-msg-id="${tempMsg.id}"]`);
                if (tempEl) {
                    tempEl.dataset.msgId = ack.msg_id;
                    tempEl.setAttribute('data-msg-id', ack.msg_id);
                    const si = tempEl.querySelector('.status-icon');
                    if (si) si.innerHTML = ICONS.check;
                }
                _setLastMsgId(currentChatId, ack.msg_id);
            }
            _sendInFlight = false;
        });
    } else {
        // Offline: store in IndexedDB queue, show ⏳ status
        _omqAdd({ tempId: tempMsg.id, chat_id: currentChatId, text, ts: Date.now() });
        showToast('Нет соединения — сообщение отправится когда появится сеть', 'warning', 4000);
        _sendInFlight = false;
    }
    input.value = '';
    input.style.height = 'auto';
    socket.emit('stop_typing', { chat_id: currentChatId });
    vibrate(8);
    // BUG-J FIX: use scrollDown() which goes through VirtualList + clears badge
    _scrollUnread = 0;
    scrollDown(true);  // true = smooth for nicer UX
}

function _nowMoscow() {
    // BUG-K FIX: use proper UTC+3 offset — setHours(+3) breaks at hour 21+
    const now = new Date(Date.now() + 3 * 60 * 60 * 1000);
    const hh  = now.getUTCHours().toString().padStart(2, '0');
    const mm  = now.getUTCMinutes().toString().padStart(2, '0');
    return `${hh}:${mm}`;
}

// ══════════════════════════════════════════════════════════
//  ОБРАБОТЧИКИ ВХОДЯЩИХ СООБЩЕНИЙ
// ══════════════════════════════════════════════════════════
// Глобальный дедупликатор сообщений — предотвращает дубли из chat_ и user_ rooms
const _seenMsgIds = new Set();
function _normMsgId(id) {
    return (id === undefined || id === null) ? '' : String(id);
}
function _markMsgSeen(id) {
    const key = _normMsgId(id);
    if (!key) return;
    _seenMsgIds.add(key);
    if (_seenMsgIds.size > 500) {
        // Чистим старые — берём первые 250 и удаляем
        const iter = _seenMsgIds.values();
        for (let i = 0; i < 250; i++) _seenMsgIds.delete(iter.next().value);
    }
}

function onNewMessage(msg) {
    if (msg.type_msg) msg.type = msg.type_msg;

    // FIX P3: игнорируем сообщения из удалённых чатов — они не должны воскрешать переписку
    if (msg.sender_id && typeof _deletedPartnerIds !== 'undefined' && _deletedPartnerIds.has(+msg.sender_id)) return;
    if (msg.chat_id  && typeof _deletedChatIds    !== 'undefined' && _deletedChatIds.has(msg.chat_id))    return;

    // Глобальная защита от дублей (chat_ + user_ rooms шлют одно сообщение)
    const _mid = _normMsgId(msg.id);
    if (_mid && _seenMsgIds.has(_mid)) return;
    if (_mid) _markMsgSeen(_mid);

    // Проверяем: это сообщение для открытого чата?
    // FIX REALTIME: cast both sides to int for safe comparison (server may send string)
    const _msgChatId = +msg.chat_id || 0;
    const _isOpenChat = (currentChatId && _msgChatId === +currentChatId)
        || (!currentChatId && currentPartnerId && (
            +msg.sender_id === +currentPartnerId || +msg.to_id === +currentPartnerId
        ));
    if (_isOpenChat) {
        // Удаляем оптимистичные дубликаты с тем же контентом
        if (+msg.sender_id === currentUser.id) {
            const container = document.getElementById('messages');
            container?.querySelectorAll('[data-optimistic="1"]').forEach(el => {
                if (el.dataset.content === (msg.content || '')) el.remove();
            });
        }
        // Защита от дублей в DOM
        if (_mid && document.querySelector(`[data-msg-id="${CSS.escape(_mid)}"]`)) return;

        hideTypingIndicator();
        // FIX: preserve scroll if user is reading history (not at bottom)
        const _msgsEl      = document.getElementById('messages');
        const _wasAtBottom = !_msgsEl || _isNearBottom(_msgsEl);
        renderNewMessage(msg, true);
        // Only auto-scroll if user was already at the bottom
        if (_wasAtBottom) {
            scrollDown(true);
        } else {
            // Show the unread badge on scroll-to-bottom button
            const badge = document.getElementById('wc-scroll-badge');
            if (badge) {
                badge.textContent = (+badge.textContent || 0) + 1;
                badge.style.display = 'flex';
            }
        }
        socket.emit('mark_read', { chat_id: currentChatId });
        _debouncedLoadChats();
        if (msg.id) _setLastMsgId(currentChatId, msg.id);
        // FIX: keep memory cache in sync with new incoming message
        const _ck = currentChatType === 'group'
            ? `g_${currentPartnerId}` : `p_${currentPartnerId}`;
        if (messagesByChatCache[_ck] && !_deletedMsgIds.has(String(msg.id))) {
            // Avoid duplicates before pushing
            const _existing = messagesByChatCache[_ck].messages;
            if (!_existing.some(m => _normMsgId(m.id) === _mid)) {
                messagesByChatCache[_ck].messages.push(msg);
            }
        }
    } else {
        const cacheKey = msg.is_group_msg ? `g_${msg.group_id}` : `p_${msg.sender_id}`;
        delete messagesByChatCache[cacheKey];
        _debouncedLoadChats();
        // Пульс аватара при новом сообщении
        const senderId = msg.is_group_msg ? msg.group_id : msg.sender_id;
        const chatKey  = msg.is_group_msg ? `g_${senderId}` : `p_${senderId}`;
        requestAnimationFrame(() => {
            const chatEl = document.querySelector(`[data-chat-key="${chatKey}"]`);
            if (chatEl) {
                chatEl.classList.add('chat-item-animate');
                setTimeout(() => chatEl.classList.remove('chat-item-animate'), 300);
                const ava = chatEl.querySelector('[data-uid]');
                if (ava) {
                    ava.classList.add('ava-pulse-anim');
                    setTimeout(() => ava.classList.remove('ava-pulse-anim'), 400);
                }
            }
        });
        vibrate([10, 30, 10]);
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

    } else {
        s.style.display = 'none'; v.style.display = 'flex';
    }
}

// Throttle typing — не отправляем чаще раза в 2с (серверный throttle тоже есть)
let _typingLastEmit = 0;
function handleTyping() {
    if (!currentChatId) return;
    const now = Date.now();
    if (now - _typingLastEmit > 2000) {
        socket.emit('typing', { chat_id: currentChatId });
        _typingLastEmit = now;
    }
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        socket.emit('stop_typing', { chat_id: currentChatId });
        _typingLastEmit = 0;
    }, 2500);
}

// ══════════════════════════════════════════════════════════
//  КОНФИДЕНЦИАЛЬНОСТЬ
// ══════════════════════════════════════════════════════════
const _PRIVACY_KEY = 'wc_privacy';
function _getPrivacy() { try{return JSON.parse(localStorage.getItem(_PRIVACY_KEY)||'{}');}catch(e){return {};} }
function _savePrivacy(k,v){ const p=_getPrivacy();p[k]=v;localStorage.setItem(_PRIVACY_KEY,JSON.stringify(p)); }

async function openPrivacySettings() {
    // Загружаем текущие настройки с сервера
    let serverPrivacy = {};
    try {
        const r = await apiFetch('/get_privacy');
        if (r && r.ok) serverPrivacy = await r.json();
    } catch(e) {}

    const mv = serverPrivacy.moments_visibility || 'contacts';
    const tv = serverPrivacy.tracks_visibility  || 'contacts';

    const ov = document.createElement('div');
    ov.className = 'modal-overlay';
    ov.onclick = e => { if (e.target === ov) ov.remove(); };

    const sh = document.createElement('div');
    sh.className = 'modal-sheet';
    sh.style.cssText = 'overflow-y:auto;max-height:96vh;padding-bottom:20px';

    function privGroup(title, icon, key, current, hint) {
        const opts = [
            {val:'all',      label:'Все',              ico:'🌍'},
            {val:'contacts', label:'Контакты',         ico:'👥'},
            {val:'nobody',   label:'Никто',            ico:'🔒'},
        ];
        return `<div style="margin-bottom:8px">
            <div style="padding:14px 16px 8px;font-size:12px;font-weight:700;color:rgba(255,255,255,.4);letter-spacing:.6px;text-transform:uppercase">${icon} ${title}</div>
            <div style="background:rgba(255,255,255,.05);border-radius:18px;overflow:hidden;margin:0 0 4px">
                ${opts.map((o,i) => `<div data-key="${key}" data-val="${o.val}" onclick="privSelectRow(this)" style="display:flex;align-items:center;padding:15px 18px;cursor:pointer;${i<2?'border-bottom:.5px solid rgba(255,255,255,.07)':''}">
                    <span style="font-size:20px;margin-right:14px">${o.ico}</span>
                    <span style="flex:1;font-size:16px;font-weight:500;color:#fff">${o.label}</span>
                    <div class="priv-check" style="width:22px;height:22px;border-radius:50%;background:${o.val===current?'var(--accent)':'transparent'};border:2px solid ${o.val===current?'var(--accent)':'rgba(255,255,255,.2)'};display:flex;align-items:center;justify-content:center;transition:all .2s">
                        ${o.val===current?'<svg width="11" height="11" viewBox="0 0 12 12" fill="none"><polyline points="2,6 5,9 10,3" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>':''}
                    </div>
                </div>`).join('')}
            </div>
            ${hint ? `<div style="font-size:12px;color:rgba(255,255,255,.35);padding:0 6px 6px">${hint}</div>` : ''}
        </div>`;
    }

    sh.innerHTML = `<div class="modal-handle"></div>
        <div style="padding:4px 4px 20px;display:flex;align-items:center;gap:12px">
            <div style="width:40px;height:40px;border-radius:12px;background:rgba(99,102,241,.2);display:flex;align-items:center;justify-content:center">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="3" y="11" width="18" height="11" rx="2" stroke="#818cf8" stroke-width="2"/><path d="M7 11V7a5 5 0 0110 0v4" stroke="#818cf8" stroke-width="2" stroke-linecap="round"/></svg>
            </div>
            <div>
                <div style="font-size:18px;font-weight:700">Конфиденциальность</div>
                <div style="font-size:13px;color:rgba(255,255,255,.4);margin-top:2px">Управляй доступом к контенту</div>
            </div>
        </div>
        ${privGroup('Мои моменты','📸','moments_visibility', mv, 'Кто может видеть твои моменты в ленте')}
        ${privGroup('Мои треки','🎵','tracks_visibility', tv, 'Кто видит твои треки в профиле')}
        <div style="margin-bottom:8px">
            <div style="padding:14px 16px 8px;font-size:12px;font-weight:700;color:rgba(255,255,255,.4);letter-spacing:.6px;text-transform:uppercase">⚙️ Дополнительно</div>
            <div style="background:rgba(255,255,255,.05);border-radius:18px;overflow:hidden;margin:0 0 4px">
                <div onclick="openBlockedList()" style="display:flex;align-items:center;padding:15px 18px;cursor:pointer;border-bottom:.5px solid rgba(255,255,255,.07)">
                    <span style="font-size:20px;margin-right:14px">🚫</span>
                    <span style="flex:1;font-size:16px;font-weight:500;color:#fff">Заблокированные</span>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><polyline points="9 18 15 12 9 6" stroke="rgba(255,255,255,.3)" stroke-width="2" stroke-linecap="round"/></svg>
                </div>
                <div onclick="openHiddenMomentsList()" style="display:flex;align-items:center;padding:15px 18px;cursor:pointer">
                    <span style="font-size:20px;margin-right:14px">👁️</span>
                    <span style="flex:1;font-size:16px;font-weight:500;color:#fff">Скрыто от пользователей</span>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><polyline points="9 18 15 12 9 6" stroke="rgba(255,255,255,.3)" stroke-width="2" stroke-linecap="round"/></svg>
                </div>
            </div>
            <div style="font-size:12px;color:rgba(255,255,255,.35);padding:0 6px 6px">Контакты видят друг друга только при взаимном сохранении</div>
        </div>
        <button id="priv-save-btn" style="width:100%;padding:16px;background:var(--accent);border:none;border-radius:16px;color:#000;font-size:16px;font-weight:700;cursor:pointer;font-family:inherit;margin-top:8px">Сохранить</button>`;

    ov.appendChild(sh);
    document.body.appendChild(ov);

    // Выбор строки
    window.privSelectRow = function(el) {
        const key = el.dataset.key;
        const val = el.dataset.val;
        sh.querySelectorAll(`[data-key="${key}"]`).forEach(row => {
            const check = row.querySelector('.priv-check');
            const isThis = row.dataset.val === val;
            if (check) {
                check.style.background = isThis ? 'var(--accent)' : 'transparent';
                check.style.borderColor = isThis ? 'var(--accent)' : 'rgba(255,255,255,.2)';
                check.innerHTML = isThis ? '<svg width="11" height="11" viewBox="0 0 12 12" fill="none"><polyline points="2,6 5,9 10,3" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' : '';
            }
        });
        _savePrivacy(key, val);
    };

    sh.querySelector('#priv-save-btn').onclick = async () => {
        const p = _getPrivacy();
        try {
            await apiFetch('/update_privacy', {
                method: 'POST',
                headers: {'Content-Type':'application/json'},
                body: JSON.stringify({
                    moments_visibility: p.moments_visibility || mv,
                    tracks_visibility:  p.tracks_visibility  || tv,
                })
            });
            showToast('Настройки сохранены ✓', 'success');
        } catch(e) { showToast('Ошибка сохранения', 'error'); }
        ov.remove();
    };
}

async function openBlockedList() {
    try {
        const r = await apiFetch('/get_blocked_users');
        const users = r.ok ? await r.json() : [];
        const ov = document.createElement('div'); ov.className='modal-overlay'; ov.onclick=e=>{if(e.target===ov)ov.remove();};
        const sh = document.createElement('div'); sh.className='modal-sheet';
        sh.innerHTML = `<div class="modal-handle"></div>
            <div style="font-size:17px;font-weight:700;margin-bottom:16px">🚫 Заблокированные</div>
            ${users.length === 0 ? '<div style="text-align:center;color:rgba(255,255,255,.4);padding:40px 0">Никого нет</div>' :
              users.map(u => `<div style="display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:.5px solid rgba(255,255,255,.07)">
                <img src="${u.avatar||'/static/default_avatar.png'}" style="width:40px;height:40px;border-radius:50%;object-fit:cover">
                <div style="flex:1"><div style="font-weight:600">${escHtml(u.name)}</div><div style="font-size:12px;color:rgba(255,255,255,.4)">@${escHtml(u.username)}</div></div>
                <button onclick="unblockUser(${u.id},this)" style="padding:8px 14px;background:rgba(239,68,68,.1);border:none;border-radius:10px;color:#ef4444;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">Разблокировать</button>
              </div>`).join('')}`;
        ov.appendChild(sh); document.body.appendChild(ov);
    } catch(e) {}
}

async function unblockUser(id, btn) {
    try {
        await apiFetch('/unblock_user/'+id, {method:'POST'});
        btn.closest('div[style*="align-items:center"]').remove();
        showToast('Разблокировано','success');
    } catch(e) {}
}

async function openHiddenMomentsList() {
    try {
        // Загружаем настройки конфиденциальности и список контактов параллельно
        const [privR, contR] = await Promise.all([
            apiFetch('/get_privacy'),
            apiFetch('/get_my_saved_contacts'),
        ]);
        const privData = privR.ok ? await privR.json() : {};
        const contacts = contR.ok ? await contR.json() : [];
        const hiddenIds = new Set((privData.hidden_from || []).map(h => h.id));

        const ov = document.createElement('div'); ov.className='modal-overlay'; ov.onclick=e=>{if(e.target===ov)ov.remove();};
        const sh = document.createElement('div'); sh.className='modal-sheet'; sh.style.cssText='max-height:90vh;overflow-y:auto';

        sh.innerHTML = `<div class="modal-handle"></div>
            <div style="font-size:17px;font-weight:700;margin-bottom:6px">👁️ Скрыть моменты от...</div>
            <div style="font-size:13px;color:rgba(255,255,255,.4);margin-bottom:18px">Выбери контакты — они не будут видеть твои моменты</div>
            <div id="hidden-contacts-list">
                ${contacts.length === 0
                    ? '<div style="text-align:center;color:rgba(255,255,255,.4);padding:40px 0;font-size:14px">Нет сохранённых контактов.<br>Сначала сохрани кого-нибудь в чате.</div>'
                    : contacts.map((c,i) => {
                        const isHidden = hiddenIds.has(c.id);
                        return `<div style="display:flex;align-items:center;gap:12px;padding:12px 4px;${i<contacts.length-1?'border-bottom:.5px solid rgba(255,255,255,.07)':''}">
                            <img src="${c.avatar||'/static/default_avatar.png'}" style="width:42px;height:42px;border-radius:50%;object-fit:cover;flex-shrink:0">
                            <div style="flex:1;min-width:0">
                                <div style="font-size:15px;font-weight:600">${escHtml(c.name)}</div>
                                <div style="font-size:12px;color:rgba(255,255,255,.4)">@${escHtml(c.username||'')}</div>
                            </div>
                            <button data-uid="${c.id}" data-hidden="${isHidden}" onclick="toggleHideMoment(this)"
                                style="padding:8px 14px;background:${isHidden?'rgba(239,68,68,.12)':'rgba(255,255,255,.06)'};border:none;border-radius:12px;color:${isHidden?'#ef4444':'rgba(255,255,255,.6)'};font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;white-space:nowrap;transition:all .2s">
                                ${isHidden ? '✗ Скрыто' : 'Скрыть'}
                            </button>
                        </div>`;
                    }).join('')
                }
            </div>`;

        ov.appendChild(sh); document.body.appendChild(ov);
    } catch(e) { showToast('Ошибка загрузки','error'); }
}

window.toggleHideMoment = async function(btn) {
    const uid    = parseInt(btn.dataset.uid);
    const hidden = btn.dataset.hidden === 'true';
    try {
        if (hidden) {
            await apiFetch('/unhide_moments_from/'+uid, {method:'POST'});
            btn.dataset.hidden = 'false';
            btn.textContent = 'Скрыть';
            btn.style.background = 'rgba(255,255,255,.06)';
            btn.style.color = 'rgba(255,255,255,.6)';
            showToast('Моменты снова видны', 'success');
        } else {
            await apiFetch('/hide_moments_from/'+uid, {method:'POST'});
            btn.dataset.hidden = 'true';
            btn.textContent = '✗ Скрыто';
            btn.style.background = 'rgba(239,68,68,.12)';
            btn.style.color = '#ef4444';
            showToast('Скрыто', 'info');
        }
    } catch(e) { showToast('Ошибка','error'); }
};

async function unhideMomentsFrom(id, btn) {
    try {
        await apiFetch('/unhide_moments_from/'+id, {method:'POST'});
        document.getElementById('hidden-row-'+id)?.remove();
        showToast('Моменты снова видны','success');
    } catch(e) {}
}

// ══════════════════════════════════════════════════════════
//  ВИДЕО-КРУЖОК (как в Telegram)
// ══════════════════════════════════════════════════════════
let _camModeActive = false;
let _videoChunks    = [];
let _videoTimer     = null;
let _videoSec       = 0;
let _videoFlashOn   = false;
let _videoFacing    = 'user';

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
            // short tap — ничего не делаем
            return;
        }

        if (_holdDone) {
            if (isRecording) stopRecording();

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
    <div style="background:rgba(14,14,20,0.97);border-radius:28px 28px 0 0;border-top:0.5px solid rgba(255,255,255,0.1);width:100%;padding:20px 20px 20px">
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
    input.addEventListener('cancel', () => { try { document.body.removeChild(input); } catch(e){} });
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
            resultDiv.innerHTML = `<div style="text-align:center;padding:10px"><div style="margin-bottom:8px;display:flex;justify-content:center;opacity:0.4">${ICONS.search.replace('16','32').replace('16','32')}</div><p style="font-size:15px;font-weight:600;margin:0">Пользователь не найден</p><p style="font-size:13px;color:var(--text-2);margin:6px 0 0">По этому номеру нет аккаунта WayChat</p></div>`;
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
                    ${isSaved ? 'Убрать' : 'Сохранить'}
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
            btn.textContent = 'Убрать';
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

// ── createBottomSheet — утилита для bottom sheet модалок ────────────────
function createBottomSheet(htmlContent, opts = {}) {
    const ov = document.createElement('div');
    ov.className = 'modal-overlay';
    ov.style.cssText = 'position:fixed;inset:0;z-index:8000;display:flex;align-items:flex-end;background:rgba(0,0,0,0.5);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)';

    const sh = document.createElement('div');
    sh.className = 'modal-sheet';
    sh.style.cssText = [
        'width:100%', 'max-width:480px', 'margin:0 auto',
        'background:rgba(22,22,28,0.98)',
        'backdrop-filter:blur(40px)', '-webkit-backdrop-filter:blur(40px)',
        'border-radius:24px 24px 0 0',
        'border-top:0.5px solid rgba(255,255,255,0.1)',
        'padding:16px 20px calc(20px)',
        'transform:translateY(100%)',
        'transition:transform 0.3s cubic-bezier(0.32,0.72,0,1)',
        'max-height:90dvh', 'overflow-y:auto',
        '-webkit-overflow-scrolling:touch',
    ].join(';');
    sh.innerHTML = htmlContent;

    ov.appendChild(sh);

    // Закрытие по клику на backdrop
    ov.addEventListener('click', (e) => {
        if (e.target === ov) {
            sh.style.transform = 'translateY(100%)';
            setTimeout(() => ov.remove(), 300);
        }
    });

    // Анимация открытия
    requestAnimationFrame(() => requestAnimationFrame(() => {
        sh.style.transform = 'translateY(0)';
    }));

    return ov;
}

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
    const name       = document.getElementById('chat-name')?.textContent || '';
    const status     = document.getElementById('chat-status')?.textContent || '';
    const isOnline   = status === 'в сети';
    const isSaved    = savedContacts.some(c => c.id === currentPartnerId);
    const customName = contactCustomNames[currentPartnerId];
    const avatarSrc  = chatPartnerAvatarSrc[currentPartnerId] || '';
    const isGroup    = currentChatType === 'group';

    const overlay = document.createElement('div');
    overlay.className = 'partner-profile-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:5500;background:#111;display:flex;flex-direction:column;overflow-y:auto;font-family:-apple-system,BlinkMacSystemFont,SF Pro Display,sans-serif';

    overlay.innerHTML = '<style>@keyframes ppSlide{from{transform:translateY(50px);opacity:0}to{transform:translateY(0);opacity:1}}.pp-anim{animation:ppSlide 0.25s cubic-bezier(.32,1.2,.42,1)}</style>'
        + '<div class="pp-anim" style="display:flex;flex-direction:column;min-height:100%">'

        // === ШАПКА ===
        + '<div style="position:relative;height:320px;overflow:hidden;flex-shrink:0">'
        + (avatarSrc
            ? '<div style="position:absolute;inset:-50px;background-image:url(\'' + (avatarSrc.replace(/'/g,"\\'")) + '\');background-size:cover;background-position:center;filter:blur(30px) brightness(0.5) saturate(1.8)"></div>'
            : '<div style="position:absolute;inset:0;background:linear-gradient(180deg,#3d1f7a 0%,#1a0a3a 100%)"></div>'
          )
        + '<div style="position:absolute;inset:0;background:linear-gradient(to bottom,rgba(0,0,0,0.05) 0%,rgba(0,0,0,0) 35%,rgba(17,17,17,0.95) 100%)"></div>'

        // Кнопка назад
        + '<button id="pp-back" style="position:absolute;top:max(env(safe-area-inset-top),48px);left:14px;width:36px;height:36px;border-radius:50%;background:rgba(0,0,0,0.38);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border:none;color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:10">'
        + '<svg width="10" height="17" viewBox="0 0 10 17" fill="none"><path d="M9 1L1 8.5L9 16" stroke="white" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/></svg>'
        + '</button>'

        // Аватар + имя по центру внизу шапки
        + '<div style="position:absolute;bottom:0;left:0;right:0;display:flex;flex-direction:column;align-items:center;padding-bottom:20px;z-index:2">'
        + '<div style="width:120px;height:120px;border-radius:50%;overflow:hidden;border:3.5px solid rgba(255,255,255,0.22);box-shadow:0 8px 40px rgba(0,0,0,0.6);margin-bottom:14px">'
        + (avatarSrc ? '<img src="' + (avatarSrc.replace(/"/g,'&quot;')) + '" style="width:100%;height:100%;object-fit:cover">' : getInitialAvatar(name,'w-full h-full',currentPartnerId))
        + '</div>'
        + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px">'
        + '<span id="pp-name-display" style="font-size:24px;font-weight:800;color:#fff;letter-spacing:-0.4px;text-shadow:0 2px 16px rgba(0,0,0,0.5)">' + (name.replace(/</g,'&lt;').replace(/>/g,'&gt;')) + '</span>'
        + '</div>'
        + (customName ? '<div style="font-size:12px;color:rgba(255,255,255,0.45);margin-bottom:4px">сохранён как «' + customName.replace(/</g,'&lt;') + '»</div>' : '')
        + '<div style="font-size:13px;font-weight:600;color:' + (isOnline ? 'var(--accent,#10b981)' : 'rgba(255,255,255,0.4)') + '">' + (isOnline ? 'в сети' : 'был(а) недавно') + '</div>'
        + '</div>'
        + '</div>'  // end шапка

        // === ТЕЛО ===
        + '<div style="background:#111;flex:1;padding-bottom:30px">'

        // Кнопки действий
        + (!isGroup ? '<div style="display:flex;gap:10px;padding:16px 16px 4px">'
            + '<button onclick="startCall(\'audio\');this.closest(\'.partner-profile-overlay\').remove()" style="flex:1;padding:13px 0;background:rgba(255,255,255,0.07);border:none;border-radius:16px;color:#fff;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;display:flex;flex-direction:column;align-items:center;gap:8px">'
            + '<div style="width:36px;height:36px;border-radius:50%;background:rgba(16,185,129,0.2);display:flex;align-items:center;justify-content:center"><svg width="18" height="18" viewBox="0 0 24 24"><path fill-rule="evenodd" clip-rule="evenodd" d="M6.6 10.79c1.4 2.8 3.8 5.11 6.6 6.6l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.58.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1C10.29 21 3 13.71 3 4.5c0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.46.57 3.58.11.35.03.74-.24 1.02L6.6 10.79z" fill="#10b981"/></svg></div>'
            + 'Позвонить</button>'
            + '<button onclick="startCall(\'video\');this.closest(\'.partner-profile-overlay\').remove()" style="flex:1;padding:13px 0;background:rgba(255,255,255,0.07);border:none;border-radius:16px;color:#fff;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;display:flex;flex-direction:column;align-items:center;gap:8px">'
            + '<div style="width:36px;height:36px;border-radius:50%;background:rgba(59,130,246,0.2);display:flex;align-items:center;justify-content:center"><svg width="18" height="18" viewBox="0 0 24 24"><path d="M17 10.5V7a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h12a1 1 0 001-1v-3.5l4 4v-11l-4 4z" fill="#60a5fa"/></svg></div>'
            + 'Видео</button>'
            + '<button onclick="this.closest(\'.partner-profile-overlay\').remove()" style="flex:1;padding:13px 0;background:rgba(255,255,255,0.07);border:none;border-radius:16px;color:#fff;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;display:flex;flex-direction:column;align-items:center;gap:8px">'
            + '<div style="width:36px;height:36px;border-radius:50%;background:rgba(139,92,246,0.2);display:flex;align-items:center;justify-content:center"><svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" fill="#a78bfa"/></svg></div>'
            + 'Написать</button>'
            + '</div>' : '')

        // Инфо блок
        + '<div style="margin:12px 16px 0;background:rgba(255,255,255,0.05);border-radius:18px;overflow:hidden" id="profile-info-block">'
        + '<div id="profile-phone-row" style="padding:14px 16px;border-bottom:0.5px solid rgba(255,255,255,0.06)">'
        + '<div style="font-size:11px;color:rgba(255,255,255,0.38);margin-bottom:3px">мобильный</div>'
        + '<div style="font-size:16px;font-weight:500;color:#4da3ff" id="profile-phone-val">—</div>'
        + '</div>'
        + '<div style="padding:14px 16px;border-bottom:0.5px solid rgba(255,255,255,0.06)">'
        + '<div style="font-size:11px;color:rgba(255,255,255,0.38);margin-bottom:3px">имя пользователя</div>'
        + '<div style="font-size:16px;font-weight:500;color:#4da3ff" id="profile-username-val">...</div>'
        + '</div>'
        + '<div id="profile-bio-row" style="display:none;padding:14px 16px;border-bottom:0.5px solid rgba(255,255,255,0.06)">'
        + '<div style="font-size:11px;color:rgba(255,255,255,0.38);margin-bottom:3px">о себе</div>'
        + '<div style="font-size:15px;color:rgba(255,255,255,0.85);line-height:1.45" id="profile-bio-val"></div>'
        + '</div>'
        + '<div id="profile-date-row" style="display:none;padding:14px 16px">'
        + '<div style="font-size:11px;color:rgba(255,255,255,0.38);margin-bottom:3px">в WayChat с</div>'
        + '<div style="font-size:15px;color:rgba(255,255,255,0.7)" id="profile-date-val"></div>'
        + '</div>'
        + '</div>'

        // Кнопки сохранить/переименовать
        + (!isGroup ? '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:10px 16px">'
            + '<button onclick="renameContactFromProfile(' + currentPartnerId + ',\'' + name.replace(/'/g,"\\'") + '\');this.closest(\'.partner-profile-overlay\').remove()" style="padding:13px;background:rgba(255,255,255,0.06);border:none;border-radius:14px;color:rgba(255,255,255,0.75);font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:7px">'
            + '<svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M17 3a2.828 2.828 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z" stroke="rgba(255,255,255,0.75)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>Переименовать</button>'
            + '<button onclick="toggleContactSave(' + currentPartnerId + ',\'' + name.replace(/'/g,"\\'") + '\')" style="padding:13px;background:' + (isSaved ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)') + ';border:none;border-radius:14px;color:' + (isSaved ? '#ef4444' : 'var(--accent,#10b981)') + ';font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:7px">'
            + (isSaved ? '<svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>Убрать' : '<svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" stroke="var(--accent,#10b981)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="9" cy="7" r="4" stroke="var(--accent,#10b981)" stroke-width="2"/><line x1="19" y1="8" x2="19" y2="14" stroke="var(--accent,#10b981)" stroke-width="2" stroke-linecap="round"/><line x1="22" y1="11" x2="16" y2="11" stroke="var(--accent,#10b981)" stroke-width="2" stroke-linecap="round"/></svg>Сохранить')
            + '</button></div>'
            : '<div style="margin:10px 16px"><button onclick="showGroupInfo()" style="width:100%;padding:14px;background:rgba(59,130,246,0.1);border:none;border-radius:14px;color:#60a5fa;font-size:15px;font-weight:600;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:8px"><svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" stroke="#60a5fa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="9" cy="7" r="4" stroke="#60a5fa" stroke-width="2"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" stroke="#60a5fa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>Участники группы</button></div>')

        // Треки пользователя (под кнопками сохранить/переименовать)
        + '<div id="profile-tracks-section" style="margin:10px 16px 0;display:none">'
        + '<div style="font-size:11px;font-weight:700;color:rgba(255,255,255,.3);letter-spacing:.6px;margin-bottom:8px;padding:0 2px" id="profile-tracks-label">ТРЕКИ</div>'
        + '<div id="profile-tracks-list" style="background:rgba(255,255,255,.04);border-radius:14px;overflow:hidden"></div>'
        + '<button id="profile-tracks-expand" style="display:none;width:100%;margin-top:6px;padding:10px;background:rgba(255,255,255,.04);border:none;border-radius:12px;color:rgba(255,255,255,.45);font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:6px" onclick="expandProfileTracks(this)">'
        + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><polyline points="6 9 12 15 18 9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
        + 'Показать все треки</button>'
        + '</div>'

        // Заблокировать — в самом низу
        + '<div style="margin:10px 16px 16px">'
        + '<button onclick="blockUserFromProfile(' + currentPartnerId + ');this.closest(\'.partner-profile-overlay\').remove()" style="width:100%;padding:13px;background:rgba(239,68,68,0.07);border:none;border-radius:14px;color:#ef4444;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:8px"><svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="#ef4444" stroke-width="2"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" stroke="#ef4444" stroke-width="2" stroke-linecap="round"/></svg>Заблокировать</button>'
        + '</div>'

        + '</div>'  // end тело
        + '</div>'; // end pp-anim

    overlay.querySelector('#pp-back').onclick = function() { overlay.remove(); };
    document.body.appendChild(overlay);

    if (!isGroup) {
        apiFetch('/get_user_profile/' + currentPartnerId).then(function(r){ return r && r.json(); }).then(function(data) {
            if (!data) return;
            var uEl  = overlay.querySelector('#profile-username-val');
            var pEl  = overlay.querySelector('#profile-phone-val');
            var bEl  = overlay.querySelector('#profile-bio-val');
            var bRow = overlay.querySelector('#profile-bio-row');
            var dEl  = overlay.querySelector('#profile-date-val');
            var dRow = overlay.querySelector('#profile-date-row');
            var nameDisplay = overlay.querySelector('#pp-name-display');
            if (uEl) uEl.textContent = data.username ? '@' + data.username : '—';
            if (pEl) pEl.textContent = data.phone || '—';
            if (data.bio && bEl && bRow) { bEl.textContent = data.bio; bRow.style.display = 'block'; }
            if (data.created_at && dEl && dRow) {
                try {
                    var d = new Date(data.created_at);
                    dEl.textContent = d.toLocaleDateString('ru-RU', { day:'numeric', month:'long', year:'numeric' });
                    dRow.style.display = 'block';
                } catch(e) {}
            }
            if (data.is_verified && data.verified_type && nameDisplay) {
                var badge = getVerifyBadge(data, 20);
                if (badge && !nameDisplay.querySelector('.vbadge-inline')) {
                    nameDisplay.insertAdjacentHTML('beforeend', '<span class="vbadge-inline" style="margin-left:6px;vertical-align:middle">' + badge + '</span>');
                }
                var chatNameEl = document.getElementById('chat-name');
                if (chatNameEl) chatNameEl.innerHTML = escHtml(getContactDisplayName(currentPartnerId, data.name)) + getVerifyBadge(data, 13);
            }
            // Треки пользователя
            if (data.tracks && data.tracks.length > 0) {
                var tracksSection = overlay.querySelector('#profile-tracks-section');
                var tracksList    = overlay.querySelector('#profile-tracks-list');
                var tracksLabel   = overlay.querySelector('#profile-tracks-label');
                var expandBtn     = overlay.querySelector('#profile-tracks-expand');
                if (tracksSection && tracksList) {
                    tracksSection.style.display = 'block';
                    if (tracksLabel) tracksLabel.textContent = 'ТРЕКИ ' + data.name.toUpperCase();

                    var allTracks = data.tracks;
                    var PREVIEW = 5;

                    function renderTrack(t, i, total) {
                        var dur = t.duration > 0 ? Math.floor(t.duration/60)+':'+(String(Math.floor(t.duration%60)).padStart(2,'0')) : '';
                        return '<div style="display:flex;align-items:center;gap:10px;padding:11px 14px;'+(i<total-1?'border-bottom:.5px solid rgba(255,255,255,.06)':'')+'">'
                            + '<div style="width:34px;height:34px;border-radius:9px;background:rgba(124,58,237,.2);flex-shrink:0;display:flex;align-items:center;justify-content:center">'
                            + '<svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M9 18V5l12-2v13" stroke="#a78bfa" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="6" cy="18" r="3" stroke="#a78bfa" stroke-width="1.5"/><circle cx="18" cy="16" r="3" stroke="#a78bfa" stroke-width="1.5"/></svg>'
                            + '</div>'
                            + '<div style="flex:1;min-width:0">'
                            + '<div style="font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+escHtml(t.title||'Без названия')+'</div>'
                            + (t.artist ? '<div style="font-size:12px;color:rgba(255,255,255,.4);margin-top:1px">'+escHtml(t.artist)+'</div>' : '')
                            + '</div>'
                            + (dur ? '<div style="font-size:12px;color:rgba(255,255,255,.3);flex-shrink:0;margin-right:4px">'+dur+'</div>' : '')
                            + (t.id ? (
                                '<button onclick="addFriendTrackToPlaylist(\''+escHtml(t.title||'')+'\',\''+escHtml(t.artist||'')+'\','+t.duration+','+t.id+')" '
                                + 'id="add-track-btn-'+t.id+'" '
                                + 'style="width:28px;height:28px;border-radius:50%;background:rgba(16,185,129,.15);border:.5px solid rgba(16,185,129,.3);color:var(--accent);display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;-webkit-tap-highlight-color:transparent;padding:0;transition:all .2s">'
                                + '<svg width="12" height="12" viewBox="0 0 24 24" fill="none"><line x1="12" y1="5" x2="12" y2="19" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/><line x1="5" y1="12" x2="19" y2="12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>'
                                + '</button>'
                              ) : '')
                            + '</div>';
                    }

                    // Показываем первые 5
                    var visible = allTracks.slice(0, PREVIEW);
                    tracksList.innerHTML = visible.map(function(t,i){ return renderTrack(t, i, visible.length); }).join('');

                    // Если треков больше 5 — кнопка развернуть
                    if (allTracks.length > PREVIEW && expandBtn) {
                        expandBtn.style.display = 'flex';
                        expandBtn.textContent = '';
                        expandBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><polyline points="6 9 12 15 18 9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> Показать все ' + allTracks.length + ' треков';
                        expandBtn._allTracks = allTracks;
                        expandBtn._renderFn  = renderTrack;
                        expandBtn._list      = tracksList;
                    }
                }
            }
        }).catch(function(){});
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

async function toggleContactSave(id, name) {
    const isSaved = savedContacts.some(c => c.id === id);
    const avatar  = chatPartnerAvatarSrc[id] || '';
    try {
        if (isSaved) {
            await apiFetch('/unsave_contact/' + id, {method:'POST'});
            savedContacts = savedContacts.filter(c => c.id !== id);
            showToast('Контакт удалён', 'info');
        } else {
            await apiFetch('/save_contact/' + id, {method:'POST'});
            savedContacts.push({ id, name, avatar, username: '' });
            showToast(`${name} сохранён ✓`, 'success');
        }
        localStorage.setItem('waychat_contacts', JSON.stringify(savedContacts));
        vibrate(15);
        // Обновляем кнопку в профиле если открыт
        const saveBtn = document.querySelector(`[onclick*="toggleContactSave(${id}"]`);
        if (saveBtn) {
            const nowSaved = !isSaved;
            saveBtn.style.background = nowSaved ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)';
            saveBtn.style.color = nowSaved ? '#ef4444' : 'var(--accent,#10b981)';
            saveBtn.innerHTML = nowSaved
                ? '<svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>Убрать'
                : '<svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" stroke="var(--accent,#10b981)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="9" cy="7" r="4" stroke="var(--accent,#10b981)" stroke-width="2"/><line x1="19" y1="8" x2="19" y2="14" stroke="var(--accent,#10b981)" stroke-width="2" stroke-linecap="round"/><line x1="22" y1="11" x2="16" y2="11" stroke="var(--accent,#10b981)" stroke-width="2" stroke-linecap="round"/></svg>Сохранить';
        }
    } catch(e) { showToast('Ошибка','error'); }
}

// ═══ ПЕРЕСЫЛКА МОМЕНТОВ ═══
function _forwardMoment(moment) {
    const ov = document.createElement('div');
    ov.className = 'modal-overlay';
    ov.onclick = e => { if (e.target === ov) ov.remove(); };
    const sh = document.createElement('div');
    sh.className = 'modal-sheet';
    sh.style.cssText = 'max-height:80vh;overflow-y:auto';

    const chats = recentChats || [];
    sh.innerHTML = `<div class="modal-handle"></div>
        <div style="font-size:17px;font-weight:700;margin-bottom:14px">Переслать момент</div>
        <div style="background:rgba(255,255,255,.04);border-radius:16px;overflow:hidden">
            ${chats.slice(0,20).map((c,i) => {
                const pid  = c.partner_id || c.id;
                const name = c.partner_name || c.name || 'Чат';
                const ava  = c.partner_avatar || '';
                return `<div data-chatid="${c.chat_id||c.id}" data-name="${escHtml(name)}"
                    onclick="_doForwardMoment(this,${JSON.stringify(moment).replace(/"/g,'&quot;')})"
                    style="display:flex;align-items:center;gap:12px;padding:12px 14px;cursor:pointer;${i<chats.length-1?'border-bottom:.5px solid rgba(255,255,255,.06)':''}">
                    ${ava ? `<img src="${ava}" style="width:42px;height:42px;border-radius:50%;object-fit:cover;flex-shrink:0">` :
                            `<div style="width:42px;height:42px;border-radius:50%;background:rgba(255,255,255,.1);display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:700;flex-shrink:0">${escHtml(name[0]||'?')}</div>`}
                    <span style="font-size:15px;font-weight:600">${escHtml(name)}</span>
                </div>`;
            }).join('')}
        </div>`;
    ov.appendChild(sh);
    document.body.appendChild(ov);
    window._momentFwdOv = ov;
}

function _doForwardMoment(el, moment) {
    const chatId = parseInt(el.dataset.chatid);
    const name   = el.dataset.name;
    if (!chatId) return;
    const isVideo = moment.media_url && /\.(mp4|mov|webm)/i.test(moment.media_url);
    socket.emit('send_message', {
        chat_id:   chatId,
        type_msg:  isVideo ? 'video' : (moment.media_url ? 'image' : 'text'),
        file_url:  moment.media_url || null,
        content:   `↪ Момент от ${moment.user_name}${moment.text ? ':\n'+moment.text : ''}`,
        sender_id: currentUser.id,
    });
    showToast(`Переслано → ${name}`, 'success');
    window._momentFwdOv?.remove();
}

// ═══ ПЕРЕСЫЛКА СООБЩЕНИЙ ═══
function _forwardMessage(msg) {
    const ov = document.createElement('div');
    ov.className = 'modal-overlay';
    ov.onclick = e => { if (e.target === ov) ov.remove(); };
    const sh = document.createElement('div');
    sh.className = 'modal-sheet';
    sh.style.cssText = 'max-height:80vh;overflow-y:auto';

    const chats = recentChats || [];
    sh.innerHTML = `<div class="modal-handle"></div>
        <div style="font-size:17px;font-weight:700;margin-bottom:14px">Переслать в чат</div>
        <div style="background:rgba(255,255,255,.04);border-radius:16px;overflow:hidden">
            ${chats.slice(0,20).map((c,i) => {
                const pid  = c.partner_id || c.id;
                const name = c.partner_name || c.name || 'Чат';
                const ava  = c.partner_avatar || '';
                return `<div onclick="doForwardMsg(this)" data-pid="${pid}" data-name="${escHtml(name)}"
                    style="display:flex;align-items:center;gap:12px;padding:12px 14px;cursor:pointer;${i<chats.length-1?'border-bottom:.5px solid rgba(255,255,255,.06)':''}">
                    ${ava ? `<img src="${ava}" style="width:42px;height:42px;border-radius:50%;object-fit:cover;flex-shrink:0">` :
                            `<div style="width:42px;height:42px;border-radius:50%;background:rgba(255,255,255,.1);display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:700;flex-shrink:0">${escHtml(name[0]||'?')}</div>`}
                    <div style="font-size:15px;font-weight:600">${escHtml(name)}</div>
                </div>`;
            }).join('')}
        </div>`;

    ov.appendChild(sh);
    document.body.appendChild(ov);

    // Сохраняем сообщение для пересылки
    window._fwdMsg = msg;
    window._fwdOv  = ov;
}

function doForwardMsg(el) {
    const msg  = window._fwdMsg;
    const ov   = window._fwdOv;
    const pid  = parseInt(el.dataset.pid);
    const name = el.dataset.name;
    if (!msg || !pid) return;

    // Определяем chat_id для этого партнёра
    const chat = (recentChats||[]).find(c => c.partner_id === pid || c.id === pid);
    const targetChatId = chat?.chat_id || chat?.id;
    if (!targetChatId) { showToast('Сначала напиши этому человеку', 'info'); ov?.remove(); return; }

    // Формируем пересланное сообщение
    const isText = !msg.type || msg.type === 'text';
    const fwdSender = msg.sender_name || (msg.sender_id === currentUser.id ? currentUser.name : '');
    const content  = isText
        ? `↪ ${fwdSender}:
${msg.content || msg.text || ''}`
        : null;
    const type_msg = isText ? 'text' : (msg.type || msg.type_msg || 'text');

    socket.emit('send_message', {
        chat_id:    targetChatId,
        type_msg:   type_msg,
        content:    content,
        file_url:   isText ? null : msg.file_url,
        sender_id:  currentUser.id,
        forwarded_from: fwdSender,
    });

    showToast(`Переслано → ${name}`, 'success');
    ov?.remove();
}

function expandProfileTracks(btn) {
    var allTracks = btn._allTracks;
    var renderFn  = btn._renderFn;
    var list      = btn._list;
    if (!allTracks || !list) return;
    list.innerHTML = allTracks.map(function(t,i){ return renderFn(t, i, allTracks.length); }).join('');
    btn.style.display = 'none';
}

// Добавить трек из профиля друга в свой плейлист (только метаданные — без файла)
// Показываем объяснение для треков добавленных из профиля друга
function _mpShowFriendTrackHelp(track) {
    // Убираем трек из активного (нечего играть) — не меняем idx
    MP._transitioning = false;

    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.85);backdrop-filter:blur(20px);display:flex;align-items:center;justify-content:center;padding:24px';
    ov.innerHTML = `
        <div style="background:rgba(25,25,35,.98);border-radius:26px;padding:28px 24px;max-width:340px;width:100%;border:.5px solid rgba(255,255,255,.1);text-align:center">
            <div style="width:64px;height:64px;border-radius:18px;background:rgba(124,58,237,.2);display:flex;align-items:center;justify-content:center;margin:0 auto 18px">
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
                    <path d="M9 18V5l12-2v13" stroke="#a78bfa" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                    <circle cx="6" cy="18" r="3" stroke="#a78bfa" stroke-width="1.8"/>
                    <circle cx="18" cy="16" r="3" stroke="#a78bfa" stroke-width="1.8"/>
                </svg>
            </div>
            <div style="font-size:18px;font-weight:800;margin-bottom:10px">${escHtml(track.title||'Трек')}</div>
            <div style="font-size:14px;color:rgba(255,255,255,.5);line-height:1.6;margin-bottom:24px">
                Этот трек добавлен из профиля друга.<br>
                Чтобы слушать — загрузи аудиофайл<br>
                с тем же названием.
            </div>
            <div style="display:flex;flex-direction:column;gap:10px">
                <button onclick="this.closest('[style*=fixed]').remove();musicPickFiles()"
                    style="padding:14px;background:var(--accent);border:none;border-radius:14px;color:#000;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit">
                    Загрузить файл
                </button>
                <button onclick="this.closest('[style*=fixed]').remove()"
                    style="padding:14px;background:rgba(255,255,255,.07);border:none;border-radius:14px;color:rgba(255,255,255,.6);font-size:15px;font-weight:600;cursor:pointer;font-family:inherit">
                    Закрыть
                </button>
            </div>
        </div>`;
    document.body.appendChild(ov);
}

async function addFriendTrackToPlaylist(title, artist, duration, serverTrackId) {
    try {
        showToast('Добавляю...', 'info');
        // Копируем трек через сервер — получаем audio_url без скачивания
        const r = await apiFetch('/add_track_from_user/' + serverTrackId, { method: 'POST' });
        if (!r?.ok) {
            const err = await r?.json().catch(() => ({}));
            showToast(err.error || 'Ошибка добавления', 'error');
            return;
        }
        const data = await r.json();

        // Сохраняем в локальный плейлист с audio_url
        const localId = Date.now();
        const track = {
            id:            localId,
            title:         data.title    || title    || 'Без названия',
            artist:        data.artist   || artist   || '',
            duration:      data.duration || duration || 0,
            coverUrl:      data.cover_url || null,
            audio_url:     data.audio_url,       // ← URL для стриминга
            serverTrackId: data.track_id,        // ← ID на сервере
            isFromVideo:   false,
            isFriendTrack: false,                // есть URL — полноценный трек
            addedAt:       Date.now(),
        };

        await _mdbPut('tracks', track);
        MP.tracks.push(track);
        _mpRender();
        // Не синкаем на сервер — это чужой трек, мы только слушаем

        // Визуально подтверждаем добавление — меняем кнопку на галочку
        const btn = document.getElementById('add-track-btn-' + serverTrackId);
        if (btn) {
            btn.style.background = 'rgba(16,185,129,.35)';
            btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><polyline points="2,6 5,9 10,3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
            btn.onclick = null;
        }
        showToast(`«${track.title}» добавлен ✓`, 'success');
        vibrate(15);
    } catch(e) {
        const errMsg = e.message || 'Ошибка добавления';
        showToast(errMsg.includes('No audio') ? 'Трек ещё загружается, попробуй через секунду' : errMsg, 'error');
        console.error('addFriendTrack:', e);
    }
}

async function hideMomentsFromUser(userId) {
    try {
        await apiFetch('/hide_moments_from/' + userId, {method:'POST'});
        showToast('Моменты скрыты от этого пользователя', 'info');
    } catch(e) { showToast('Ошибка', 'error'); }
}

async function blockUserFromProfile(userId) {
    try {
        await apiFetch('/block_user/' + userId, {method:'POST'});
        savedContacts = savedContacts.filter(c => c.id !== userId);
        localStorage.setItem('waychat_contacts', JSON.stringify(savedContacts));
        showToast('Пользователь заблокирован', 'info');
    } catch(e) { showToast('Ошибка', 'error'); }
}

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
    _syncHeaderAva();
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
        { type:'microphone',    icon:'MIC', name:'Микрофон',     desc:'Голосовые сообщения и звонки' },
        { type:'camera',        icon:'CAM', name:'Камера',       desc:'Видеозвонки и смена аватара' },
        { type:'notifications', icon:'BELL', name:'Уведомления',  desc:'Push-уведомления о сообщениях' },
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
        row.innerHTML='<div style="display:flex;align-items:center;justify-content:center;width:48px;height:48px;border-radius:14px;background:rgba(255,255,255,0.08);flex-shrink:0">'+_permIcon(p.icon)+'</div>'
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

function _updateNotifToggle(enabled) {
    const toggle = document.getElementById('notif-toggle');
    if (!toggle) return;
    const dot = toggle.querySelector('div');
    toggle.style.background = enabled ? 'var(--accent)' : 'rgba(255,255,255,0.2)';
    if (dot) dot.style.right = enabled ? '3px' : 'calc(100% - 25px)';
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
        try { document.body.removeChild(input); } catch(e) {}
        if (!file) return;
        if (context === 'moment') { _showMomentEditor(file); return; }
        if (!currentChatId) return;

        // Показываем TG-стиль превью с прогрессом прямо в списке сообщений
        const isVid  = file.type.startsWith('video');
        const previewUrl = URL.createObjectURL(file);
        const tmpId  = 'media-upload-' + Date.now();

        // Оптимистичный пузырь с прогрессом
        const tmpRow = document.createElement('div');
        tmpRow.className = 'msg-row out';
        tmpRow.id = tmpId;
        tmpRow.innerHTML = `
            <div class="bubble" style="padding:4px;background:var(--accent);border-radius:18px 18px 4px 18px;position:relative;overflow:hidden;max-width:240px;min-width:120px;min-height:120px">
                ${isVid
                    ? `<video src="${previewUrl}" style="width:100%;max-height:280px;border-radius:14px;display:block;object-fit:cover" muted playsinline></video>`
                    : `<img src="${previewUrl}" style="width:100%;max-height:280px;border-radius:14px;display:block;object-fit:cover">`
                }
                <div id="${tmpId}-overlay" style="position:absolute;inset:0;background:rgba(0,0,0,0.42);display:flex;flex-direction:column;align-items:center;justify-content:center;border-radius:14px">
                    <svg width="52" height="52" viewBox="0 0 52 52" style="transform:rotate(-90deg)">
                        <circle cx="26" cy="26" r="20" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="3"/>
                        <circle id="${tmpId}-ring" cx="26" cy="26" r="20" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"
                            stroke-dasharray="${(2*Math.PI*20).toFixed(1)}" stroke-dashoffset="${(2*Math.PI*20).toFixed(1)}"
                            style="transition:stroke-dashoffset 0.3s ease"/>
                    </svg>
                    <span id="${tmpId}-pct" style="position:absolute;font-size:12px;font-weight:700;color:#fff">0%</span>
                </div>
            </div>`;

        const msgsEl = document.getElementById('messages');
        if (msgsEl) {
            msgsEl.appendChild(tmpRow);
            msgsEl.scrollTop = msgsEl.scrollHeight;
        }

        // Загружаем с XMLHttpRequest для прогресса
        try {
            const url_res = await new Promise((resolve, reject) => {
                const fd  = new FormData();
                fd.append('file', file);
                const xhr = new XMLHttpRequest();
                const C   = 2 * Math.PI * 20;
                xhr.upload.onprogress = (e) => {
                    if (!e.lengthComputable) return;
                    const pct  = e.loaded / e.total * 100;
                    const ring = document.getElementById(`${tmpId}-ring`);
                    const pctEl = document.getElementById(`${tmpId}-pct`);
                    if (ring) ring.style.strokeDashoffset = (C * (1 - pct / 100)).toFixed(1);
                    if (pctEl) pctEl.textContent = Math.round(pct) + '%';
                };
                xhr.onload = () => {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        try { resolve(JSON.parse(xhr.responseText)); }
                        catch(e) { reject(new Error('parse error')); }
                    } else { reject(new Error('upload failed')); }
                };
                xhr.onerror = () => reject(new Error('network error'));
                xhr.open('POST', '/upload_media');
                xhr.withCredentials = true;
                xhr.send(fd);
            });

            // Убираем превью и отправляем реальное сообщение
            tmpRow.remove();
            URL.revokeObjectURL(previewUrl);
            socket.emit('send_message', {
                chat_id: currentChatId,
                type_msg: url_res.type || (isVid ? 'video' : 'image'),
                file_url: url_res.url,
                sender_id: currentUser.id
            });
        } catch(e) {
            tmpRow.remove();
            URL.revokeObjectURL(previewUrl);
            showToast('Ошибка загрузки', 'error');
        }
    };
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
    ov.style.cssText = 'position:fixed;inset:0;z-index:9500;background:#000;touch-action:none;font-family:-apple-system,BlinkMacSystemFont,SF Pro Display,sans-serif';

    // ── Медиа-фон (заполняет экран с закруглёнными углами снизу) ──
    const bg = document.createElement('div');
    bg.style.cssText = 'position:absolute;inset:0;border-radius:0 0 28px 28px;overflow:hidden';
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
    // Градиент сверху для кнопок
    const topGrad = document.createElement('div');
    topGrad.style.cssText='position:absolute;top:0;left:0;right:0;height:140px;background:linear-gradient(to bottom,rgba(0,0,0,0.55),transparent);pointer-events:none';
    bg.appendChild(topGrad);
    ov.appendChild(bg);

    // ── Кнопка закрыть (сверху слева) ──
    const closeBtn = document.createElement('button');
    closeBtn.style.cssText='position:absolute;top:max(env(safe-area-inset-top),50px);left:16px;z-index:20;width:34px;height:34px;border-radius:50%;background:rgba(0,0,0,0.4);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border:none;color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center';
    closeBtn.innerHTML='<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1 1l10 10M11 1L1 11" stroke="white" stroke-width="2" stroke-linecap="round"/></svg>';
    closeBtn.onclick = () => { ov.remove(); URL.revokeObjectURL(url); };
    ov.appendChild(closeBtn);

    // ── Инструменты справа (гео + текст) — iOS Camera style ──
    const toolsRight = document.createElement('div');
    toolsRight.style.cssText='position:absolute;right:14px;top:50%;transform:translateY(-50%);z-index:20;display:flex;flex-direction:column;gap:12px';

    const geoBtn = document.createElement('button');
    geoBtn.id='me-geo-btn';
    geoBtn.style.cssText='width:44px;height:44px;border-radius:50%;background:rgba(0,0,0,0.45);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border:1px solid rgba(255,255,255,0.2);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center';
    geoBtn.innerHTML='<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" stroke="white" stroke-width="2"/><circle cx="12" cy="9" r="2.5" stroke="white" stroke-width="2"/></svg>';

    const txtBtn = document.createElement('button');
    txtBtn.style.cssText='width:44px;height:44px;border-radius:50%;background:rgba(0,0,0,0.45);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border:1px solid rgba(255,255,255,0.2);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center';
    txtBtn.innerHTML='<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M17 3a2.828 2.828 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z" stroke="white" stroke-width="2" stroke-linecap="round"/></svg>';

    toolsRight.appendChild(geoBtn);
    toolsRight.appendChild(txtBtn);
    ov.appendChild(toolsRight);

    // ── Гео-метка (перетаскиваемая) ──
    const geoTag = document.createElement('div');
    geoTag.id = 'me-geo-tag';
    geoTag.style.cssText = 'position:absolute;left:50%;top:30%;background:rgba(0,0,0,0.6);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border:1px solid rgba(255,255,255,0.25);border-radius:22px;padding:9px 16px;color:#fff;font-size:14px;font-weight:600;cursor:grab;display:none;align-items:center;gap:7px;white-space:nowrap;user-select:none;-webkit-user-select:none;z-index:20;transform:translateX(-50%)';
    geoTag.innerHTML = '📍 <span id="me-geo-txt">...</span>';
    _makeDraggable(geoTag, ov);
    ov.appendChild(geoTag);

    // ── Текстовая надпись (перетаскиваемая) ──
    const capTag = document.createElement('div');
    capTag.id = 'me-cap-tag';
    capTag.style.cssText = 'position:absolute;left:50%;bottom:220px;transform:translateX(-50%);background:rgba(0,0,0,0.5);backdrop-filter:blur(10px);border-radius:16px;padding:2px 6px;display:none;z-index:20;min-width:120px;max-width:80vw';
    const capInput = document.createElement('input');
    capInput.id='me-cap'; capInput.placeholder='Текст...';
    capInput.style.cssText='background:transparent;border:none;outline:none;color:#fff;font-size:18px;font-weight:600;text-align:center;padding:10px 14px;width:100%;font-family:inherit';
    capTag.appendChild(capInput);
    _makeDraggable(capTag, ov);
    ov.appendChild(capTag);

    // ── Нижняя панель iOS 26 стиль ──
    //const panel = document.createElement('div');

    //panel.style.display = 'none';

    // Строка: аватар + "Ваша история" + кнопка Опубликовать
    const bottomRow = document.createElement('div');
    bottomRow.style.cssText='display:flex;align-items:center;gap:12px';

    // Аватар пользователя
    const avaDiv = document.createElement('div');
    avaDiv.style.cssText='width:42px;height:42px;border-radius:50%;overflow:hidden;border:2px solid rgba(255,255,255,0.3);flex-shrink:0';
    const _ava = window.currentUser?.avatar;
    avaDiv.innerHTML = _ava && _ava !== 'null' && !_ava.startsWith('emoji:')
        ? '<img src="'+_ava+'" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display=\'none\'">'
        : '<div style="width:100%;height:100%;background:var(--accent,#10b981);display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:700;color:#000">'+(window.currentUser?.name||'?')[0].toUpperCase()+'</div>';

    // Текст
    const storyInfo = document.createElement('div');
    storyInfo.style.cssText='flex:1;min-width:0';
    storyInfo.innerHTML='<div style="font-size:14px;font-weight:700;color:#fff">Ваша история</div>'
        +'<div style="font-size:12px;color:rgba(255,255,255,0.5);margin-top:1px">Исчезнет через 24 часа · Все контакты</div>';

    // Кнопка Опубликовать
    const sBtn = document.createElement('button');
    sBtn.id='me-share';
    sBtn.style.cssText='padding:12px 20px;background:var(--accent,#10b981);border:none;border-radius:22px;color:#000;font-size:15px;font-weight:800;cursor:pointer;font-family:inherit;display:flex;align-items:center;gap:8px;box-shadow:0 0 20px rgba(16,185,129,0.4);white-space:nowrap;flex-shrink:0';
    sBtn.innerHTML='Опубликовать <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M5 12h14M12 5l7 7-7 7" stroke="#000" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    sBtn.onclick = () => _publishMomentEditor(ov, file, url);

    bottomRow.appendChild(avaDiv);
    bottomRow.appendChild(storyInfo);
    bottomRow.appendChild(sBtn);
    panel.appendChild(bottomRow);
    ov.appendChild(panel);

    // ── Обработчики кнопок инструментов ──
    geoBtn.onclick = () => _requestMeGeo(geoBtn, geoTag);
    txtBtn.onclick = () => {
        const sh = capTag.style.display === 'flex' ? 'none' : 'flex';
        capTag.style.display = sh;
        if (sh === 'flex') { setTimeout(() => capInput.focus(), 50); }
    };

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
    const lbl = document.getElementById('me-geo-lbl');
    // Сброс
    if (_meGeo) {
        _meGeo=null; geoTag.style.display='none';
        btn.style.background='rgba(255,255,255,0.1)'; btn.style.borderColor='rgba(255,255,255,0.18)';
        if(lbl) lbl.textContent='Геолокация'; return;
    }
    if(lbl) lbl.textContent='Определяю...';
    if (!navigator.geolocation) {
        showToast('Геолокация не поддерживается','warning');
        if(lbl) lbl.textContent='Геолокация'; return;
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
        if(lbl) lbl.textContent = name.length>16 ? name.slice(0,15)+'…' : name;
        btn.style.background='rgba(16,185,129,0.25)'; btn.style.borderColor='#10b981';
        const gt = document.getElementById('me-geo-txt');
        if(gt) gt.textContent = name.length>22 ? name.slice(0,20)+'…' : name;
        geoTag.style.display='flex';
    } catch(e) {
        const msg = e.code===1 ? 'Разрешите геолокацию в настройках Safari' : e.code===2 ? 'GPS недоступен' : 'Истёк тайм-аут';
        showToast(msg,'warning',4000);
        if(lbl) lbl.textContent='Геолокация';
    }
}



// ══════════════════════════════════════════════════════════
//  МОМЕНТЫ v2 — полная перезапись
//  Архитектура: один fetch → momentsCache → bar + tab рендерятся из кэша
// ══════════════════════════════════════════════════════════

// ── Стейт ──────────────────────────────────────────────
let _momentUploading       = false;
let _momentUploadFile      = null;
let _momentUploadPreviewUrl= null;
let _momentUploadCaption   = '';
let _momentUploadGeo       = null;
let _momentsBarVisible     = false;
// _mediaCache уже объявлен выше как Map

// ── Viewed tracking ──────────────────────────────────────
function _getViewedUsers() {
    try { return new Set(JSON.parse(localStorage.getItem('wc_viewed_mu') || '[]').map(Number)); }
    catch(e) { return new Set(); }
}
function _markUserViewed(uid) {
    const s = _getViewedUsers(); s.add(uid);
    try { localStorage.setItem('wc_viewed_mu', JSON.stringify([...s].slice(-200))); } catch(e) {}
}

// ── ГЛАВНАЯ ФУНКЦИЯ ЗАГРУЗКИ ─────────────────────────────
// Всегда грузит с сервера → обновляет кэш → рендерит bar + таб
async function loadMoments(forceRender = false) {
    try {
        const r = await fetch('/get_moments', {
            credentials: 'include',
            cache: 'no-store',
        });
        if (!r.ok) {
            console.warn('[moments] fetch failed:', r.status);
            // Рендерим из кэша если есть
            _renderMomentsBar();
            _renderMomentsTab();
            return;
        }
        const moments = await r.json();
        if (!Array.isArray(moments)) { console.warn('[moments] not array'); return; }

        momentsCache        = moments;
        momentsLastLoad     = Date.now();
        window.currentMoments = moments;

        _renderMomentsBar();
        _renderMomentsTab();
    } catch(e) {
        console.error('[moments] loadMoments error:', e);
        // Рендерим из кэша даже при ошибке сети
        _renderMomentsBar();
        _renderMomentsTab();
    }
}

// ── БАР: рендер ─────────────────────────────────────────


// ── Строим кольцо + аватар (SVG кольцо как в TG) ────────
function _buildRingAvatar(user, isNew, size) {
    const r  = size / 2 - 3;
    const cx = size / 2, cy = size / 2;
    const C  = (2 * Math.PI * r).toFixed(2);
    const gid = 'rg_' + (user.id || 0) + '_' + Math.random().toString(36).slice(2, 5);

    let ringColor;
    if (isNew) {
        ringColor = `url(#${gid})`;
    } else {
        ringColor = 'rgba(255,255,255,0.18)';
    }

    const grad = isNew ? `<defs><linearGradient id="${gid}" x1="0%" y1="100%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#10b981"/>
        <stop offset="50%" stop-color="#06b6d4"/>
        <stop offset="100%" stop-color="#3b82f6"/>
    </linearGradient></defs>` : '';

    const avatarHtml = getAvatarHtml(user, 'w-full h-full');

    return `
        <div style="position:absolute;inset:5px;border-radius:50%;overflow:hidden">${avatarHtml}</div>
        <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="position:absolute;inset:0;pointer-events:none;overflow:visible">
            ${grad}
            <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${ringColor}" stroke-width="2" stroke-linecap="round"/>
        </svg>`;
}

// ── ТАБ «Моменты»: рендер списка ────────────────────────
function _renderMomentsTab() {
    const container = document.getElementById('full-moments-list');
    if (!container) return;

    const moments = momentsCache || [];
    container.innerHTML = '';

    if (_momentUploading && _momentUploadFile) {
        _renderUploadingCard(container);
    }

    // FIX MOMENTS EMPTY: if uploading, don't show empty state even if cache is empty
    if (!moments.length) {
        if (!_momentUploading) {
            container.innerHTML += `<div style="text-align:center;padding:60px 20px;opacity:0.3">
                <div style="font-size:48px;margin-bottom:12px">🌅</div>
                <div style="font-size:16px;font-weight:600;margin-bottom:6px">Нет моментов</div>
                <div style="font-size:13px">Моменты появляются от людей которых вы сохранили</div>
            </div>`;
        }
        return;
    }

    const myUid  = currentUser?.id;
    const byUser = new Map();
    moments.forEach(m => {
        if (!byUser.has(m.user_id)) byUser.set(m.user_id, []);
        byUser.get(m.user_id).push(m);
    });

    const viewed = _getViewedUsers();
    byUser.forEach((userMoments, uid) => {
        const first  = userMoments[0];
        const isNew  = !viewed.has(uid);
        const isMe   = uid === myUid;

        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:14px;padding:11px 16px;cursor:pointer;transition:background .15s;-webkit-tap-highlight-color:transparent';
        row.onpointerdown = () => row.style.background = 'rgba(255,255,255,0.05)';
        row.onpointerup   = () => row.style.background = '';
        row.onpointerleave= () => row.style.background = '';

        // Аватар с кольцом
        const avaDiv = document.createElement('div');
        avaDiv.style.cssText = 'position:relative;width:62px;height:62px;flex-shrink:0';
        avaDiv.innerHTML = _buildRingAvatar(
            { id: uid, name: first.user_name, avatar: first.user_avatar },
            isNew, 62
        );

        const infoDiv = document.createElement('div');
        infoDiv.style.cssText = 'flex:1;min-width:0';
        infoDiv.innerHTML = `
            <div style="font-weight:600;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                ${isMe ? 'Мой момент' : escHtml(first.user_name || '')}
                ${isNew ? '<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#10b981;margin-left:6px;vertical-align:middle"></span>' : ''}
            </div>
            <div style="font-size:12px;color:var(--text-2);margin-top:2px">
                ${userMoments.length > 1 ? userMoments.length + ' моментов · ' : ''}${first.timestamp || ''}
            </div>`;

        row.appendChild(avaDiv);
        row.appendChild(infoDiv);
        row.onclick = () => openUserMomentsViewer(uid);
        row.addEventListener('touchend', (e) => { e.preventDefault(); openUserMomentsViewer(uid); }, { passive: false });
        container.appendChild(row);
    });
}

// ── Карточка загрузки момента ────────────────────────────
function _renderUploadingCard(container) {
    const card = document.createElement('div');
    card.id = 'moment-uploading-card';
    card.style.cssText = 'display:flex;align-items:center;gap:16px;padding:14px 16px;background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.18);border-radius:20px;margin:8px 16px 4px;animation:fadeIn 0.3s ease';

    const isVid = _momentUploadFile?.type.startsWith('video');
    const previewUrl = _momentUploadPreviewUrl || '';

    const C = (2 * Math.PI * 22).toFixed(2);
    card.innerHTML = `
        <div style="width:68px;height:68px;border-radius:16px;overflow:hidden;flex-shrink:0;position:relative;background:#111">
            ${previewUrl ? `<${isVid ? 'video' : 'img'} src="${previewUrl}" style="width:100%;height:100%;object-fit:cover;filter:blur(3px) brightness(0.55)" ${isVid ? 'muted playsinline' : ''}/>` : ''}
            <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center">
                <svg width="52" height="52" viewBox="0 0 52 52" style="transform:rotate(-90deg)">
                    <circle cx="26" cy="26" r="22" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="3"/>
                    <circle id="upload-ring" cx="26" cy="26" r="22" fill="none" stroke="#10b981" stroke-width="3"
                        stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C}"
                        style="transition:stroke-dashoffset 0.4s ease"/>
                </svg>
                <span id="upload-pct-text" style="position:absolute;font-size:11px;font-weight:700;color:#fff">0%</span>
            </div>
        </div>
        <div style="flex:1;min-width:0">
            <div style="font-weight:600;font-size:14px;margin-bottom:6px">Публикация момента...</div>
            <div style="height:3px;background:rgba(255,255,255,0.08);border-radius:2px;overflow:hidden">
                <div id="moment-upload-bar" style="height:100%;background:linear-gradient(90deg,#10b981,#34d399);width:0%;transition:width 0.4s ease;border-radius:2px"></div>
            </div>
            <div id="moment-upload-pct" style="font-size:11px;color:rgba(255,255,255,0.4);margin-top:4px">Загрузка...</div>
        </div>`;
    container.insertBefore(card, container.firstChild);
}

function _updateUploadProgress(pct) {
    const bar    = document.getElementById('moment-upload-bar');
    const pctEl  = document.getElementById('moment-upload-pct');
    const ring   = document.getElementById('upload-ring');
    const pctTxt = document.getElementById('upload-pct-text');
    const C = 2 * Math.PI * 22;
    if (bar)    bar.style.width = pct + '%';
    if (pctEl)  pctEl.textContent = pct < 100 ? `${Math.round(pct)}%` : 'Готово!';
    if (pctTxt) pctTxt.textContent = pct < 100 ? `${Math.round(pct)}%` : '✓';
    if (ring)   ring.style.strokeDashoffset = (C * (1 - pct / 100)).toFixed(2);
}

// ── Публикация момента из редактора ─────────────────────
async function _publishMomentEditor(ov, file, url) {
    const caption = (document.getElementById('me-cap')?.value || '').trim();
    const geo     = _meGeo;

    _momentUploading        = true;
    _momentUploadFile       = file;
    _momentUploadCaption    = caption;
    _momentUploadGeo        = geo;
    if (_momentUploadPreviewUrl) { try { URL.revokeObjectURL(_momentUploadPreviewUrl); } catch(e){} }
    _momentUploadPreviewUrl = URL.createObjectURL(file);

    // Закрываем редактор
    ov.remove();
    try { URL.revokeObjectURL(url); } catch(e) {}
    _meFile = null; _meGeo = null;

    // Показываем таб Моменты с карточкой загрузки
    switchTab('moments');
    // FIX MOMENTS UPLOAD: render tab synchronously so upload card appears immediately
    const container = document.getElementById('full-moments-list');
    if (container) {
        _renderMomentsTab();
    }
    await new Promise(res => setTimeout(res, 60));

    // Симулируем прогресс (iOS не даёт реальный XHR progress через fetch)
    let pct = 0;
    const timer = setInterval(() => {
        pct += pct < 30 ? 5 : pct < 60 ? 2.5 : pct < 82 ? 1 : 0.2;
        _updateUploadProgress(Math.min(Math.round(pct), 82));
    }, 250);

    try {
        const fd = new FormData();
        fd.append('file', file);
        if (caption) fd.append('text', caption);
        if (geo) { fd.append('geo_name', geo.name); fd.append('geo_lat', geo.lat); fd.append('geo_lng', geo.lng); }

        const uploadResult = await new Promise((resolve) => {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', '/create_moment', true);
            xhr.withCredentials = true;
            xhr.upload.onprogress = (ev) => {
                if (ev.lengthComputable) {
                    clearInterval(timer);
                    _updateUploadProgress(Math.round((ev.loaded / ev.total) * 95));
                }
            };
            xhr.onload = () => {
                clearInterval(timer);
                _updateUploadProgress(100);
                try { const d = JSON.parse(xhr.responseText); resolve({ ok: !!d.success }); }
                catch(e) { resolve({ ok: xhr.status >= 200 && xhr.status < 300 }); }
            };
            xhr.onerror = () => { clearInterval(timer); resolve({ ok: false }); };
            xhr.timeout = 90000;
            xhr.ontimeout = () => { clearInterval(timer); resolve({ ok: false }); };
            xhr.send(fd);
        });

        await new Promise(res => setTimeout(res, 350));
        showToast(uploadResult.ok ? 'Момент опубликован! 🎉' : 'Ошибка загрузки — попробуй ещё раз', uploadResult.ok ? 'success' : 'error');

    } catch(e) {
        clearInterval(timer);
        console.error('[moment] publish error:', e);
        showToast('Ошибка сети — попробуй ещё раз', 'error');
    }

    // Сброс + перезагрузка
    _momentUploading = false;
    _momentUploadFile = null;
    if (_momentUploadPreviewUrl) { try { URL.revokeObjectURL(_momentUploadPreviewUrl); } catch(e){} _momentUploadPreviewUrl = null; }
    momentsCache = null;
    momentsLastLoad = 0;
    await loadMoments();
}

// ── Показать/скрыть moments bar ──────────────────────────
async function _showMomentsBar() {
    if (_momentsBarVisible) return;
    _momentsBarVisible = true;

    const bar    = document.getElementById('moments-bar');
    const scroll = document.getElementById('moments-bar-scroll');
    if (!bar) return;

    bar.style.display = 'block';
    requestAnimationFrame(() => requestAnimationFrame(() => {
        bar.style.maxHeight = '110px';
        bar.style.opacity   = '1';
    }));

    // Skeleton пока данные не загружены
    if (!momentsCache && scroll) {
        scroll.innerHTML = [0,1,2,3,4].map(() => `
            <div style="display:flex;flex-direction:column;align-items:center;gap:5px;flex-shrink:0">
                <div class="wc-skeleton" style="width:64px;height:64px;border-radius:50%"></div>
                <div class="wc-skeleton" style="width:40px;height:9px;border-radius:5px"></div>
            </div>`).join('');
    } else {
        _renderMomentsBar();
    }

    // Грузим данные (не блокирует показ skeleton)
    await loadMoments();
}



// ── Открыть просмотрщик моментов пользователя ───────────
function openUserMomentsViewer(targetUid) {
    const moments = (momentsCache || []).filter(m => m.user_id === targetUid);
    if (!moments.length) { showToast('Нет активных моментов', 'info'); return; }
    _markUserViewed(targetUid);
    _renderMomentsBar(); // обновляем кольцо → серое
    _renderMomentsTab();
    _openMomentsOverlay(moments, 0);
}

function _openMomentsOverlay(moments, startIdx) {
    let idx = startIdx || 0;
    let _videoEl = null;
    let _autoTimer = null;

    const ov = document.createElement('div');
    ov.id = 'moments-overlay';
    ov.style.cssText = [
        'position:fixed', 'inset:0', 'z-index:9500',
        'background:#000', 'touch-action:none',
        'font-family:-apple-system,BlinkMacSystemFont,SF Pro Display,sans-serif',
        'overflow:hidden',
    ].join(';');

    document.body.appendChild(ov);

    function close() {
        if (_videoEl) { _videoEl.pause(); _videoEl.src = ''; }
        clearTimeout(_autoTimer);
        delete window._ovPrev;
        delete window._ovNext;
        ov.remove();
    }

    function goTo(newIdx) {
        if (newIdx < 0 || newIdx >= moments.length) { close(); return; }
        // Пауза предыдущего видео
        if (_videoEl) { _videoEl.pause(); _videoEl.src = ''; _videoEl = null; }
        clearTimeout(_autoTimer);
        idx = newIdx;
        render();
    }

    function render() {
        const m     = moments[idx];
        if (!m) { close(); return; }
        const isVid = m.media_url && /\.(mp4|mov|webm|m4v)/i.test(m.media_url);
        const isImg = m.media_url && !isVid;
        const isMe  = m.user_id === currentUser?.id;
        const total = moments.length;

        ov.innerHTML = '';

        // ── Фоновый блюр ──────────────────────────────────────
        const bg = document.createElement('div');
        bg.style.cssText = 'position:absolute;inset:0;overflow:hidden;z-index:0';
        if (isImg) {
            bg.innerHTML = `<img src="${m.media_url}" style="width:100%;height:100%;object-fit:cover;filter:blur(28px) brightness(0.35) saturate(1.4)" draggable="false">`;
        } else if (isVid) {
            // Для видео — цветной градиент как фон
            bg.style.background = 'linear-gradient(160deg,#0a0a15,#12121f)';
        } else {
            bg.style.background = 'linear-gradient(160deg,#0a0a15,#12121f)';
        }
        ov.appendChild(bg);

        // ── Прогресс-бары (сверху) ────────────────────────────
        const progRow = document.createElement('div');
        progRow.style.cssText = `position:absolute;top:max(env(safe-area-inset-top,44px),44px);left:14px;right:14px;display:flex;gap:4px;z-index:20`;
        for (let i = 0; i < total; i++) {
            const bar = document.createElement('div');
            bar.style.cssText = `flex:1;height:2.5px;border-radius:2px;overflow:hidden;background:rgba(255,255,255,0.25)`;
            if (i < idx) {
                bar.style.background = '#fff';
            } else if (i === idx) {
                // FIX MOMENTS PROGRESS: animated fill for both photo AND video
                bar.style.background = 'rgba(255,255,255,0.25)';
                bar.id = 'moment-prog-active';
                const fill = document.createElement('div');
                fill.id = 'moment-prog-fill';
                fill.style.cssText = 'height:100%;background:#fff;border-radius:2px;width:0%';
                bar.appendChild(fill);
            }
            progRow.appendChild(bar);
        }
        ov.appendChild(progRow);

        // ── Хедер (аватар + имя + кнопки) ────────────────────
        const hdr = document.createElement('div');
        hdr.style.cssText = `position:absolute;top:calc(max(env(safe-area-inset-top,44px),44px) + 18px);left:0;right:0;padding:0 14px;display:flex;align-items:center;gap:10px;z-index:20`;
        hdr.innerHTML = `
            <div style="width:36px;height:36px;border-radius:50%;overflow:hidden;border:2px solid rgba(255,255,255,0.5);flex-shrink:0">
                ${getAvatarHtml({id:m.user_id,name:m.user_name,avatar:m.user_avatar},'w-full h-full')}
            </div>
            <div style="flex:1;min-width:0">
                <div style="font-weight:700;font-size:14px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${isMe ? 'Вы' : escHtml(m.user_name||'')}</div>
                <div style="font-size:11px;color:rgba(255,255,255,0.5)">${m.timestamp||''}</div>
            </div>
            <div style="display:flex;gap:8px;flex-shrink:0">
                ${isMe ? `
                <button id="ov-viewers-btn" onclick="event.stopPropagation();_showMomentViewers(${m.id})"
                    style="width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,0.12);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="white" stroke-width="2"/><circle cx="12" cy="12" r="3" stroke="white" stroke-width="2"/></svg>
                </button>
                <button onclick="event.stopPropagation();deleteMoment(${m.id})"
                    style="width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,0.12);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </button>` : ''}
                <button onclick="event.stopPropagation();_ovClose()"
                    style="width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,0.12);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="white" stroke-width="2.5" stroke-linecap="round"/></svg>
                </button>
            </div>`;
        ov.appendChild(hdr);

        // ── Медиа (по центру, на весь экран) ──────────────────
        const mediaWrap = document.createElement('div');
        mediaWrap.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;z-index:10';

        if (isImg) {
            const img = document.createElement('img');
            img.src = m.media_url;
            img.draggable = false;
            img.style.cssText = 'width:100%;height:100%;object-fit:contain;pointer-events:none;user-select:none;-webkit-user-select:none';
            mediaWrap.appendChild(img);
            // Авто-перелистывание через 7 сек для фото + анимированный прогресс
            const PHOTO_DURATION = 7000;
            _autoTimer = setTimeout(() => goTo(idx + 1), PHOTO_DURATION);
            // Анимируем прогресс-бар текущего слайда
            const fill = document.getElementById('moment-prog-fill');
            if (fill) {
                fill.style.transition = `width ${PHOTO_DURATION}ms linear`;
                requestAnimationFrame(() => { fill.style.width = '100%'; });
            }
        } else if (isVid) {
            const vid = document.createElement('video');
            vid.src       = m.media_url;
            vid.autoplay  = true;
            vid.playsInline = true;
            vid.muted     = false;
            vid.loop      = false;
            vid.controls  = false; // БЕЗ контролов — только свайп
            vid.style.cssText = 'width:100%;height:100%;object-fit:contain;pointer-events:none';
            _videoEl = vid;
            mediaWrap.appendChild(vid);

            // Прогресс для видео
            vid.addEventListener('timeupdate', () => {
                if (!vid.duration) return;
                const fill = document.getElementById('moment-prog-fill');
                if (fill) fill.style.width = (vid.currentTime / vid.duration * 100) + '%';
            });
            // Автопереход после окончания видео
            vid.addEventListener('ended', () => goTo(idx + 1));
            // iOS: нужно явно вызвать play() после пользовательского жеста
            vid.play().catch(() => {
                // При ошибке autoplay — показываем кнопку play
                const playBtn = document.createElement('div');
                playBtn.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;z-index:15;cursor:pointer';
                playBtn.innerHTML = '<div style="width:72px;height:72px;border-radius:50%;background:rgba(255,255,255,0.2);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center"><svg width="28" height="28" viewBox="0 0 24 24" fill="none"><polygon points="5 3 19 12 5 21 5 3" fill="white"/></svg></div>';
                playBtn.onclick = () => { vid.play(); playBtn.remove(); };
                mediaWrap.appendChild(playBtn);
            });
        } else {
            // Текстовый момент
            const txt = document.createElement('div');
            txt.style.cssText = 'color:#fff;font-size:22px;font-weight:700;text-align:center;padding:40px 24px;line-height:1.5;text-shadow:0 2px 20px rgba(0,0,0,0.8)';
            txt.textContent = m.text || '';
            mediaWrap.appendChild(txt);
            // Авто-переход через 5 сек для текста
            _autoTimer = setTimeout(() => goTo(idx + 1), 5000);
        }

        // Текст поверх медиа если есть
        if (m.text && m.media_url) {
            const caption = document.createElement('div');
            caption.style.cssText = 'position:absolute;bottom:80px;left:16px;right:16px;text-align:center;color:#fff;font-size:17px;font-weight:600;text-shadow:0 2px 12px rgba(0,0,0,0.9);z-index:15;pointer-events:none';
            caption.textContent = m.text;
            mediaWrap.appendChild(caption);
        }

        // Гео-метка
        if (m.geo_name) {
            const geo = document.createElement('div');
            geo.style.cssText = 'position:absolute;bottom:20px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:6px;background:rgba(0,0,0,0.5);backdrop-filter:blur(10px);border-radius:20px;padding:7px 14px;color:rgba(255,255,255,0.8);font-size:13px;white-space:nowrap;z-index:15;pointer-events:none';
            geo.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="10" r="3" stroke="currentColor" stroke-width="2"/></svg>${escHtml(m.geo_name)}`;
            mediaWrap.appendChild(geo);
        }

        ov.appendChild(mediaWrap);

        // ── Зоны тапа: левая треть → назад, правая треть → вперёд ──
        const tapZones = document.createElement('div');
        tapZones.style.cssText = 'position:absolute;inset:0;z-index:18;display:flex;pointer-events:none';
        const zL = document.createElement('div');
        zL.style.cssText = 'flex:0 0 33%;pointer-events:all;cursor:pointer';
        zL.onclick = (e) => { e.stopPropagation(); goTo(idx - 1); };
        const zR = document.createElement('div');
        zR.style.cssText = 'flex:1;pointer-events:all;cursor:pointer';
        zR.onclick = (e) => { e.stopPropagation(); goTo(idx + 1); };
        tapZones.appendChild(zL);
        tapZones.appendChild(zR);
        ov.appendChild(tapZones);

        // Помечаем просмотренным
        fetch(`/view_moment/${m.id}`, { method:'POST', credentials:'include' }).catch(()=>{});
        _markUserViewed(m.user_id);
    }

    // ── Свайп вверх/вниз → закрыть ──────────────────────────
    let _tx = 0, _ty = 0;
    ov.addEventListener('touchstart', (e) => {
        _tx = e.touches[0].clientX;
        _ty = e.touches[0].clientY;
    }, { passive: true });

    ov.addEventListener('touchend', (e) => {
        const dx = e.changedTouches[0].clientX - _tx;
        const dy = e.changedTouches[0].clientY - _ty;
        if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 60) {
            // Вертикальный свайп → закрыть
            close();
            return;
        }
        if (Math.abs(dx) > 50) {
            if (dx < 0) goTo(idx + 1); // влево → вперёд
            else        goTo(idx - 1); // вправо → назад
        }
    }, { passive: true });

    // Глобальные хелперы (для WayChat API)
    window._ovClose = close;
    window._ovPrev  = () => goTo(idx - 1);
    window._ovNext  = () => goTo(idx + 1);

    render();
}

// ── Socket: новый момент от другого пользователя ─────────
// (вызывается из socket handler)
function onNewMomentSocket(data) {
    momentsCache    = null;
    momentsLastLoad = 0;
    loadMoments();
    if (currentTab === 'moments') _renderMomentsTab();
}

// ── switchTab: грузим моменты при открытии таба ──────────
// Патч поверх существующего switchTab
const _origSwitchTab = typeof switchTab === 'function' ? switchTab : null;
function switchTab(tab) {
    currentTab = tab;
    const chSec = document.getElementById('chats-section');
    const moSec = document.getElementById('moments-section');

    if (chSec) chSec.style.display = tab === 'chats' ? '' : 'none';
    if (moSec) moSec.style.display = tab === 'moments' ? '' : 'none';

    if (tab === 'chats') {
        const cl = document.getElementById('chat-list');
        if (!cl?.children.length || (Date.now() - _lastChatsLoad) > 15000) loadChats();
        else renderChatList(recentChats);
    } else if (tab === 'moments') {
        _renderMomentsTab(); // сразу из кэша
        const stale = !momentsCache || (Date.now() - momentsLastLoad) > 30000;
        if (stale) loadMoments(); // фоново обновляем
    }
}

// ── Удаление момента ─────────────────────────────────────
async function deleteMoment(mid) {
    // Подтверждение перед удалением
    const confirmed = await _confirmDialog('Удалить момент?', 'Момент будет удалён навсегда', 'Удалить', 'Отмена');
    if (!confirmed) return;

    try {
        const r = await fetch(`/delete_moment/${mid}`, { method: 'POST', credentials: 'include' });
        if (r.ok) {
            showToast('Момент удалён', 'success');
            momentsCache    = null;
            momentsLastLoad = 0;
            // Закрываем overlay момента (наш новый overlay имеет id moments-overlay)
            const ov = document.getElementById('moments-overlay');
            if (ov) ov.remove();
            // Также закрываем старые оверлеи
            document.querySelectorAll('[id^="mv-ov-"]').forEach(el => el.remove());
            loadMoments();
        } else {
            const err = await r.json().catch(() => ({}));
            showToast(err.error || 'Ошибка удаления', 'error');
        }
    } catch(e) {
        console.error('deleteMoment:', e);
        showToast('Ошибка сети', 'error');
    }
}

// Универсальный диалог подтверждения
function _confirmDialog(title, message, confirmText, cancelText) {
    return new Promise(resolve => {
        // Убираем старый
        document.getElementById('_confirm-dlg')?.remove();

        const ov = document.createElement('div');
        ov.id = '_confirm-dlg';
        ov.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:flex-end;justify-content:center;background:rgba(0,0,0,0.5);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)';

        const sh = document.createElement('div');
        sh.style.cssText = 'width:100%;max-width:480px;background:rgba(22,22,28,0.98);border-radius:24px 24px 0 0;border-top:0.5px solid rgba(255,255,255,0.1);padding:20px 20px calc(20px);transform:translateY(100%);transition:transform 0.28s cubic-bezier(0.32,0.72,0,1)';
        sh.innerHTML = `
            <div style="width:36px;height:4px;background:rgba(255,255,255,0.15);border-radius:2px;margin:0 auto 18px"></div>
            <div style="font-size:18px;font-weight:700;text-align:center;margin-bottom:8px;color:#fff">${title}</div>
            <div style="font-size:14px;color:rgba(255,255,255,0.5);text-align:center;margin-bottom:22px;line-height:1.5">${message}</div>
            <div style="display:flex;flex-direction:column;gap:10px">
                <button id="_confirm-yes" style="width:100%;padding:15px;background:#ef4444;border:none;border-radius:16px;color:#fff;font-size:16px;font-weight:700;cursor:pointer;font-family:inherit">${confirmText}</button>
                <button id="_confirm-no"  style="width:100%;padding:15px;background:rgba(255,255,255,0.08);border:none;border-radius:16px;color:#fff;font-size:16px;font-weight:500;cursor:pointer;font-family:inherit">${cancelText}</button>
            </div>`;

        ov.appendChild(sh);
        const _pr = document.getElementById('portal-root') || document.body;
        _pr.style.pointerEvents = 'all';
        _pr.appendChild(ov);

        requestAnimationFrame(() => requestAnimationFrame(() => {
            sh.style.transform = 'translateY(0)';
        }));

        const close = (result) => {
            sh.style.transform = 'translateY(100%)';
            setTimeout(() => ov.remove(), 300);
            resolve(result);
        };

        sh.querySelector('#_confirm-yes').onclick = () => close(true);
        sh.querySelector('#_confirm-no').onclick  = () => close(false);
        ov.addEventListener('click', (e) => { if (e.target === ov) close(false); });
    });
}

// ── openCreateMomentModal ────────────────────────────────


// ── Preload helper ───────────────────────────────────────
function _preloadMedia(url) {
    if (!url || _mediaCache.has(url)) return;
    _mediaCache.set(url, url); // Map: key=url, value=url
    if (/\.(mp4|mov|webm)/i.test(url)) return;
    const img = new Image(); img.src = url;
}


// ── Moments pull-down ──
function _setupMomentsPullDown() {
    const mainContent = document.getElementById('main-content');
    if (!mainContent) return;

    let _pullStart = 0, _pulling = false, _momentsShown = false;
    let _pullIndicator = null;

    function _getPullIndicator() {
        if (_pullIndicator) return _pullIndicator;
        _pullIndicator = document.createElement('div');
        _pullIndicator.style.cssText = 'position:fixed;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,#10b981,#34d399);transform:scaleX(0);transform-origin:left;z-index:9999;border-radius:0 0 3px 3px;opacity:0';
        document.body.appendChild(_pullIndicator);
        return _pullIndicator;
    }

    mainContent.addEventListener('touchstart', (e) => {
        // FIX MOMENTS: allow pull from anywhere in main-content, not just chats-section
        const chatWin = document.getElementById('chat-window');
        if (chatWin?.classList.contains('active')) return; // don't pull when chat is open
        if (mainContent.scrollTop > 5) return;
        _pullStart = e.touches[0].clientY;
        _pulling = true;
        _momentsShown = _momentsBarVisible;
    }, { passive: true });

    mainContent.addEventListener('touchmove', (e) => {
        if (!_pulling) return;
        const chatWin = document.getElementById('chat-window');
        if (chatWin?.classList.contains('active')) { _pulling = false; return; }
        const dy = e.touches[0].clientY - _pullStart;
        if (dy <= 0) return;

        // Зелёная полоска прогресса
        const progress = Math.min(dy / 70, 1);
        const ind = _getPullIndicator();
        ind.style.opacity = String(progress);
        ind.style.transform = `scaleX(${progress})`;

        if (dy > 60 && !_momentsShown) {
            _showMomentsBar();
            _momentsShown = true;
            vibrate(10);
            ind.style.transform = 'scaleX(1)';
            ind.style.opacity = '1';
        }
    }, { passive: true });

    mainContent.addEventListener('touchend', () => {
        _pulling = false;
        const ind = _getPullIndicator();
        ind.style.transition = 'opacity 0.35s ease';
        ind.style.opacity = '0';
        setTimeout(() => { ind.style.transition = ''; ind.style.transform = 'scaleX(0)'; }, 380);
    }, { passive: true });
}

// ── Показать/скрыть Moments bar ──

function _hideMomentsBar() {
    if (!_momentsBarVisible) return;
    _momentsBarVisible = false;
    const bar = document.getElementById('moments-bar');
    if (!bar) return;
    bar.style.maxHeight = '0';
    bar.style.opacity   = '0';
    setTimeout(() => { bar.style.display = 'none'; }, 300);
}

function _renderMomentsBarSkeleton(scroll) {
    if (!scroll) return;
    scroll.innerHTML = [
        // "Добавить" кнопка
        `<div style="display:flex;flex-direction:column;align-items:center;gap:5px;flex-shrink:0">
            <div style="width:62px;height:62px;border-radius:50%;border:2px dashed rgba(255,255,255,0.2);background:rgba(255,255,255,0.03);display:flex;align-items:center;justify-content:center;cursor:pointer" onclick="openCreateMomentModal()">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                    <line x1="12" y1="4" x2="12" y2="20" stroke="rgba(255,255,255,0.5)" stroke-width="2.5" stroke-linecap="round"/>
                    <line x1="4" y1="12" x2="20" y2="12" stroke="rgba(255,255,255,0.5)" stroke-width="2.5" stroke-linecap="round"/>
                </svg>
            </div>
            <span style="font-size:11px;color:rgba(255,255,255,0.4)">Добавить</span>
        </div>`,
        // Скелетоны других пользователей
        ...Array(4).fill(0).map(() =>
            `<div style="display:flex;flex-direction:column;align-items:center;gap:5px;flex-shrink:0">
                <div class="wc-skeleton" style="width:62px;height:62px;border-radius:50%"></div>
                <div class="wc-skeleton" style="width:40px;height:9px;border-radius:5px"></div>
            </div>`
        )
    ].join('');
}

function _renderMomentsBar() {
    const scroll = document.getElementById('moments-bar-scroll');
    if (!scroll) return;

    const moments = momentsCache || [];
    const myId    = currentUser?.id;
    const myMoment = moments.find(m => m.user_id === myId);

    // ── Собираем HTML ──────────────────────────────────────────
    scroll.innerHTML = '';

    // 1. МОЙ блок — всегда первый
    const myBlock = _buildMyMomentBlock(myMoment);
    scroll.appendChild(myBlock);

    // 2. Чужие моменты — по одному на пользователя
    const byUser = new Map();
    moments.forEach(m => {
        if (m.user_id === myId) return;
        if (!byUser.has(m.user_id)) byUser.set(m.user_id, m);
    });

    if (byUser.size === 0 && !myMoment) {
        // Нет чужих моментов — показываем заглушку
        const empty = document.createElement('div');
        empty.style.cssText = 'display:flex;align-items:center;padding:0 8px;opacity:0.3;font-size:13px;white-space:nowrap;flex-shrink:0';
        empty.textContent   = 'Пока нет моментов';
        scroll.appendChild(empty);
    }

    byUser.forEach((m, uid) => {
        const viewed = _viewedMomentUsers?.has(uid);
        const item   = _buildMomentBarItem(
            { id: uid, name: m.user_name, avatar: m.user_avatar },
            !viewed, false, false,
            () => openUserMomentsViewer(uid)
        );
        scroll.appendChild(item);
    });
}

function _buildMyMomentBlock(myMoment) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:5px;flex-shrink:0';

    const avaWrap = document.createElement('div');
    avaWrap.style.cssText = 'position:relative;width:62px;height:62px;cursor:pointer';

    if (myMoment) {
        // Есть момент — показываем аватар + маленький "+" снизу справа
        avaWrap.onclick = () => openUserMomentsViewer(currentUser.id);
        avaWrap.addEventListener('touchend', e => { e.preventDefault(); openUserMomentsViewer(currentUser.id); }, { passive: false });

        const ring = _buildMomentRing(62, true, false);
        const avaInner = document.createElement('div');
        avaInner.style.cssText = 'position:absolute;inset:5px;border-radius:50%;overflow:hidden';
        avaInner.innerHTML = getAvatarHtml(currentUser, 'w-full h-full');

        avaWrap.appendChild(ring);
        avaWrap.appendChild(avaInner);

        // Маленькая кнопка "+" поверх
        const miniPlus = document.createElement('div');
        miniPlus.style.cssText = 'position:absolute;bottom:-2px;right:-2px;width:22px;height:22px;border-radius:50%;background:#10b981;border:2px solid var(--bg,#1d1d1e);display:flex;align-items:center;justify-content:center;z-index:3;cursor:pointer';
        miniPlus.innerHTML = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none"><line x1="12" y1="4" x2="12" y2="20" stroke="white" stroke-width="3" stroke-linecap="round"/><line x1="4" y1="12" x2="20" y2="12" stroke="white" stroke-width="3" stroke-linecap="round"/></svg>';
        miniPlus.onclick = e => { e.stopPropagation(); openCreateMomentModal(); };
        miniPlus.addEventListener('touchend', e => { e.preventDefault(); e.stopPropagation(); openCreateMomentModal(); }, { passive: false });
        avaWrap.appendChild(miniPlus);
    } else {
        // Нет момента — большая кнопка "+"
        avaWrap.onclick = () => openCreateMomentModal();
        avaWrap.addEventListener('touchend', e => { e.preventDefault(); openCreateMomentModal(); }, { passive: false });
        avaWrap.style.cssText += ';border:2px dashed rgba(255,255,255,0.25);border-radius:50%;background:rgba(255,255,255,0.03);display:flex;align-items:center;justify-content:center';
        avaWrap.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <line x1="12" y1="4" x2="12" y2="20" stroke="rgba(255,255,255,0.6)" stroke-width="2.5" stroke-linecap="round"/>
            <line x1="4" y1="12" x2="20" y2="12" stroke="rgba(255,255,255,0.6)" stroke-width="2.5" stroke-linecap="round"/>
        </svg>`;
    }

    wrap.appendChild(avaWrap);

    const label = document.createElement('span');
    label.style.cssText = 'font-size:11px;color:rgba(255,255,255,0.45);text-align:center';
    label.textContent   = myMoment ? 'Мой' : 'Добавить';
    wrap.appendChild(label);
    return wrap;
}

// Строим SVG-кольцо вокруг аватара (как в TG/Instagram)
function _buildMomentRing(size, isNew, viewed) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttribute('width', size);
    svg.setAttribute('height', size);
    svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
    svg.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:visible';

    const cx = size/2, cy = size/2, r = size/2 - 3.5;
    const gid = 'mg_' + Math.random().toString(36).slice(2,8);

    let strokeAttr;
    if (!isNew || viewed) {
        strokeAttr = 'stroke="rgba(255,255,255,0.22)" stroke-width="1.5"';
    } else {
        // Градиентное кольцо
        const defs = document.createElementNS('http://www.w3.org/2000/svg','defs');
        defs.innerHTML = `<linearGradient id="${gid}" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#10b981"/>
            <stop offset="50%" stop-color="#06b6d4"/>
            <stop offset="100%" stop-color="#3b82f6"/>
        </linearGradient>`;
        svg.appendChild(defs);
        strokeAttr = `stroke="url(#${gid})" stroke-width="2"`;
    }

    svg.innerHTML += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" ${strokeAttr} stroke-linecap="round"/>`;
    return svg;
}


function _buildMomentBarItem(user, isNew, isClose, isMe, onClick) {
    const wrap = document.createElement('div');
    wrap.className = 'moment-ava-item';
    wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:5px;flex-shrink:0;cursor:pointer;touch-action:manipulation;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent';
    wrap.onclick = onClick;
    wrap.addEventListener('touchend', e => { e.preventDefault(); e.stopPropagation(); onClick && onClick(); }, { passive: false });

    const size = 62;
    const avatarHtml = getAvatarHtml(user, 'w-full h-full');

    // Используем новую _buildMomentRing
    const ringEl   = _buildMomentRing(size, isNew, !isNew);
    const ringHtml = ringEl.outerHTML;

    const label = isMe ? 'Мой' : escHtml((user.name || '').split(' ')[0]).slice(0, 9);

    wrap.innerHTML = `
        <div style="position:relative;width:${size}px;height:${size}px;flex-shrink:0;pointer-events:none">
            <div style="position:absolute;inset:5px;border-radius:50%;overflow:hidden">${avatarHtml}</div>
            ${ringHtml}
        </div>
        <span style="font-size:11px;color:var(--text-2);max-width:62px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center;pointer-events:none">${label}</span>`;

    return wrap;
}

// Алиас для кнопки "+" в moments-bar
function openCreateMomentModal() {
    pickMedia('moment');
}

// ── Свайпы по чатам в списке ──
function _setupChatListSwipes() {
    let _sw = { el: null, startX: 0, startY: 0, dx: 0, active: false, rAF: null };

    document.addEventListener('touchstart', (e) => {
        const item = e.target.closest('.chat-item');
        if (!item) return;
        const chatWin = document.getElementById('chat-window');
        if (chatWin?.classList.contains('active')) return;
        _sw.el = item;
        _sw.startX = e.touches[0].clientX;
        _sw.startY = e.touches[0].clientY;
        _sw.dx = 0;
        _sw.active = true;
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
        if (!_sw.active || !_sw.el) return;
        const dx = e.touches[0].clientX - _sw.startX;
        const dy = Math.abs(e.touches[0].clientY - _sw.startY);
        if (dy > Math.abs(dx) * 1.5) { _sw.active = false; _resetSwipe(_sw.el); return; }
        if (Math.abs(dx) < 6) return;

        _sw.dx = dx;
        const clamped = Math.max(-90, Math.min(90, dx * 0.7));
        if (_sw.rAF) cancelAnimationFrame(_sw.rAF);
        _sw.rAF = requestAnimationFrame(() => {
            if (!_sw.el) return;
            _sw.el.style.transform = `translateX(${clamped}px)`;
            _sw.el.style.transition = 'none';
            // Показываем подсказку
            const rightHint = _sw.el.querySelector('.swipe-hint-right');
            const leftHint  = _sw.el.querySelector('.swipe-hint-left');
            if (rightHint) rightHint.style.opacity = dx > 20 ? Math.min((dx - 20) / 40, 1) : '0';
            if (leftHint)  leftHint.style.opacity  = dx < -20 ? Math.min((-dx - 20) / 40, 1) : '0';
        });
    }, { passive: true });

    document.addEventListener('touchend', () => {
        if (!_sw.active || !_sw.el) return;
        _sw.active = false;
        const dx = _sw.dx;
        const el = _sw.el;
        _sw.el = null;

        if (dx > 70) {
            // Свайп вправо — быстрый ответ
            _triggerQuickReply(el);
        } else if (dx < -70) {
            // Свайп влево — архив
            _triggerArchive(el);
        } else {
            _resetSwipe(el);
        }
    }, { passive: true });
}

function _resetSwipe(el) {
    if (!el) return;
    el.style.transition = 'transform 0.22s cubic-bezier(0.22,1,0.36,1)';
    el.style.transform = '';
    const rh = el.querySelector('.swipe-hint-right');
    const lh = el.querySelector('.swipe-hint-left');
    if (rh) rh.style.opacity = '0';
    if (lh) lh.style.opacity = '0';
}

function _triggerQuickReply(el) {
    vibrate([10, 20]);
    el.style.transition = 'transform 0.18s ease';
    el.style.transform = 'translateX(12px)';
    setTimeout(() => _resetSwipe(el), 200);
    // Открываем чат
    el.click();
}

function _triggerArchive(el) {
    vibrate([10, 20]);
    el.style.transition = 'transform 0.18s ease, opacity 0.18s ease';
    el.style.transform = 'translateX(-100%)';
    el.style.opacity = '0';
    setTimeout(() => {
        el.style.maxHeight = el.offsetHeight + 'px';
        el.style.transition += ', max-height 0.22s ease, padding 0.22s ease';
        el.style.maxHeight = '0';
        el.style.padding = '0';
        setTimeout(() => el.remove(), 240);
    }, 180);
    showToast('Чат архивирован', 'info', 1800);
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
        b.style.cssText = 'position:fixed;bottom:max(70px,82px);left:12px;right:12px;z-index:9998;background:var(--surface);border:1px solid rgba(16,185,129,0.25);border-radius:18px;padding:14px 16px;display:flex;align-items:center;gap:12px;box-shadow:0 8px 32px rgba(0,0,0,0.55)';

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

// visibilitychange уже зарегистрирован в init() с TTL-проверкой (30 сек)
// Дублирующий обработчик убран — он вызывал loadChats() при каждом возврате на экран

// ══════════════════════════════════════════════════════════
//  ЗАПУСК
// ══════════════════════════════════════════════════════════
async function doLogout() {
    // FIX: clear caches on logout
    try { await MsgDB.clear(); } catch(e) {}
    try { localStorage.removeItem('_wc_del_chat_ids'); } catch(e) {}
    try { localStorage.removeItem('_wc_del_ids'); } catch(e) {}
    try { localStorage.removeItem('waychat_chats_cache'); } catch(e) {}
    try { await fetch('/logout', { method: 'GET', credentials: 'same-origin' }); } catch(e) {}
    window.location.href = '/login';
}

// ── Keyboard shortcuts (только ПК) ────────────────────────────────
(function() {
    if (!window.matchMedia('(hover:hover)').matches) return; // пропускаем тачскрин
    document.addEventListener('keydown', (e) => {
        // Ctrl/Cmd+K — фокус на поиск
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            document.getElementById('search-input')?.focus();
            return;
        }
        // Escape — закрыть модалки / десктоп меню
        if (e.key === 'Escape') {
            document.getElementById('_wc_dctx')?.remove();
            document.getElementById('_wc_ctx')?.remove();
            document.querySelector('.modal-overlay')?.remove();
            return;
        }
        // Enter в поле ввода — уже обрабатывается
    });
})();

window.onload = init;
// ══════════════════════════════════════════════════════════════════
//  🎵 MUSIC PLAYER v4 — Background play, Canvas EQ, Long video
// ══════════════════════════════════════════════════════════════════



const EQ_FREQS = [32,64,125,250,500,1000,2000,4000,8000,16000];
const EQ_LABELS = ['32','64','125','250','500','1k','2k','4k','8k','16k'];
const EQ_PRESETS = {
    'Flat':       [0,0,0,0,0,0,0,0,0,0],
    'Bass Boost': [8,7,5,2,0,0,0,0,0,0],
    'Rock':       [5,4,3,1,0,0,1,3,4,5],
    'Pop':        [-1,0,2,4,4,3,1,-1,-1,-1],
    'Jazz':       [3,2,1,2,3,3,2,1,1,1],
    'Vocal':      [-2,-2,0,3,5,5,3,1,-1,-2],
    'Electronic': [5,4,1,0,-2,2,1,3,4,5],
    'Classical':  [3,2,0,-2,-3,-1,0,2,3,4],
};

// ══ IndexedDB ══
let _mDB = null;
async function _mdbOpen() {
    if (_mDB) return _mDB;
    return new Promise((res, rej) => {
        const req = indexedDB.open('wc_music_v1', 1);
        req.onupgradeneeded = e => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('tracks')) db.createObjectStore('tracks',{keyPath:'id',autoIncrement:true});
            if (!db.objectStoreNames.contains('blobs'))  db.createObjectStore('blobs', {keyPath:'id'});
        };
        req.onsuccess = e => { _mDB = e.target.result; res(_mDB); };
        req.onerror = () => rej(req.error);
    });
}
async function _mdbPut(store, val) {
    const db = await _mdbOpen();
    return new Promise((res,rej) => { const r=db.transaction(store,'readwrite').objectStore(store).put(val); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); });
}
async function _mdbGetAll(store) {
    const db = await _mdbOpen();
    return new Promise((res,rej) => { const r=db.transaction(store,'readonly').objectStore(store).getAll(); r.onsuccess=()=>res(r.result||[]); r.onerror=()=>rej(r.error); });
}
async function _mdbGet(store, key) {
    const db = await _mdbOpen();
    return new Promise((res,rej) => { const r=db.transaction(store,'readonly').objectStore(store).get(key); r.onsuccess=()=>res(r.result||null); r.onerror=()=>rej(r.error); });
}
async function _mdbDelete(store, key) {
    const db = await _mdbOpen();
    return new Promise((res,rej) => { const r=db.transaction(store,'readwrite').objectStore(store).delete(key); r.onsuccess=()=>res(); r.onerror=()=>rej(r.error); });
}

// ══ Progress overlay ══
function _showImportProgress(msg, pct, sub) {
    let ov = document.getElementById('music-import-overlay');
    if (!ov) {
        ov = document.createElement('div');
        ov.id = 'music-import-overlay';
        ov.style.cssText = 'position:fixed;inset:0;z-index:8500;background:rgba(0,0,0,.82);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px';
        ov.innerHTML = `
            <div style="width:76px;height:76px;border-radius:50%;background:rgba(16,185,129,.12);border:2px solid rgba(16,185,129,.3);display:flex;align-items:center;justify-content:center">
                <svg id="miov-icon" width="30" height="30" viewBox="0 0 24 24" fill="none" style="animation:mpSpin 1s linear infinite">
                    <circle cx="12" cy="12" r="10" stroke="rgba(16,185,129,.2)" stroke-width="2"/>
                    <path d="M12 2a10 10 0 0 1 10 10" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round"/>
                </svg>
            </div>
            <div style="text-align:center;max-width:280px">
                <div id="miov-msg" style="font-size:17px;font-weight:700;color:white;margin-bottom:6px"></div>
                <div id="miov-sub" style="font-size:13px;color:rgba(255,255,255,.45);min-height:18px"></div>
            </div>
            <div style="width:260px">
                <div style="height:4px;background:rgba(255,255,255,.08);border-radius:2px;overflow:hidden">
                    <div id="miov-bar" style="height:100%;background:var(--accent);border-radius:2px;width:0%;transition:width .4s ease"></div>
                </div>
                <div style="display:flex;justify-content:space-between;margin-top:5px">
                    <span id="miov-pct" style="font-size:11px;color:rgba(255,255,255,.3)">0%</span>
                    <span id="miov-eta" style="font-size:11px;color:rgba(255,255,255,.3)"></span>
                </div>
            </div>`;
        document.body.appendChild(ov);
    }
    ov.style.display = 'flex';
    const p = Math.round(Math.min(100, Math.max(0, pct)));
    const el = id => document.getElementById(id);
    if (el('miov-msg')) el('miov-msg').textContent = msg;
    if (el('miov-sub')) el('miov-sub').textContent = sub || '';
    if (el('miov-bar')) el('miov-bar').style.width = p + '%';
    if (el('miov-pct')) el('miov-pct').textContent = p + '%';
}
function _hideImportProgress() {
    const ov = document.getElementById('music-import-overlay');
    if (!ov) return;
    ov.style.transition = 'opacity .35s';
    ov.style.opacity = '0';
    setTimeout(() => { ov.style.display='none'; ov.style.opacity=''; ov.style.transition=''; }, 380);
}

// ══ Аудио-движок ══
// audioEl — DOM элемент, воспроизведение
// AudioContext создаётся ТОЛЬКО при первом play() (user gesture)
// Цепочка: audioEl → srcNode → eqFilters[10] → analyserNode → gainNode → destination
// Фоновый режим: silent buffer + interval keepalive

const MP = {
    tracks: [], idx: -1, playing: false,
    shuffle: false, repeat: false, eqEnabled: false,
    volume: 0.8, filterQuery: '',
    audioEl: null,
    ctx: null, srcNode: null,
    eqFilters: [], analyserNode: null, gainNode: null,
    vizRAF: null,
    eqGains: [0,0,0,0,0,0,0,0,0,0],
    eqDragging: -1,
    _transitioning: false,
    _vizConnected: false,
};

// ── audioEl: создаём один раз ──
function _initAudioEl() {
    if (MP.audioEl) return;
    const a = document.createElement('audio');
    a.id = 'mp-bg-audio';
    a.setAttribute('playsinline', '');
    a.setAttribute('webkit-playsinline', '');
    a.setAttribute('x-webkit-airplay', 'allow');
    a.preload = 'auto';
    document.body.appendChild(a);
    MP.audioEl = a;
    a.addEventListener('timeupdate', _mpTimeUpdate);
    a.addEventListener('ended', _mpOnEnded);
    a.addEventListener('loadedmetadata', () => {
        const el = document.getElementById('mpc-dur');
        if (el) el.textContent = _mpFmt(a.duration);
    });
    a.addEventListener('error', () => {
        if (MP._transitioning) return;
        showToast('Ошибка воспроизведения', 'error');
        MP.playing = false; _mpUpdateCard(); _mpUpdateMiniPlayer();
    });
    if ('mediaSession' in navigator) {
        navigator.mediaSession.setActionHandler('play',          () => { if (!MP.playing) musicTogglePlay(); });
        navigator.mediaSession.setActionHandler('pause',         () => { if (MP.playing)  musicTogglePlay(); });
        navigator.mediaSession.setActionHandler('previoustrack', musicPrev);
        navigator.mediaSession.setActionHandler('nexttrack',     musicNext);
        navigator.mediaSession.setActionHandler('seekto',        e => { if (e.seekTime != null) a.currentTime = e.seekTime; });
    }
}

function _mpOnEnded() {
    if (MP._transitioning) return;
    const d = MP.audioEl.duration;
    if (isFinite(d) && d > 0 && MP.audioEl.currentTime < d - 0.5) return;
    MP.playing = false;
    _mpStopViz();
    if (MP.repeat) {
        MP.audioEl.currentTime = 0;
        MP.audioEl.play().catch(() => {});
        MP.playing = true;
    } else {
        _mpUpdateCard(); _mpUpdateMiniPlayer(); musicNext();
    }
}

// ── AudioContext: создаём при первом play() ──
function _initWebAudio() {
    if (MP.ctx || !MP.audioEl) return;
    try {
        const AC = window.AudioContext || window.webkitAudioContext;
        MP.ctx = new AC();

        // ТОЛЬКО тихий буфер + analyser для визуализатора
        // audioEl НЕ подключается через createMediaElementSource — иначе iOS глушит в фоне
        MP.analyserNode = MP.ctx.createAnalyser();
        MP.analyserNode.fftSize = 512;

        // EQ фильтры создаём но применяем через Web Audio отдельного source (не audioEl)
        MP.eqFilters = EQ_FREQS.map((freq, i) => {
            const f = MP.ctx.createBiquadFilter();
            f.type = i === 0 ? 'lowshelf' : i === EQ_FREQS.length - 1 ? 'highshelf' : 'peaking';
            f.frequency.value = freq;
            f.gain.value = 0; f.Q.value = 1.4;
            return f;
        });

        // Запускаем keepalive
        _mpKeepAlive();
    } catch(e) {
        console.warn('WebAudio:', e.message);
        MP.ctx = null;
    }
}
function _initVizCtx() { return !!MP.ctx; }

// ── Keepalive: держим ctx running через постоянный resume ──
// ВАЖНО: audioEl НЕ подключён к AudioContext (createMediaElementSource не вызывается)
// iOS не может заглушить audioEl который воспроизводит через нативный HTML5
// AudioContext используется ТОЛЬКО для EQ-фильтров через отдельный source
let _silentSrc = null, _keepTimer = null;
function _mpKeepAlive() {
    if (!MP.ctx) return;
    // Тихий зацикленный буфер — iOS видит активный AudioContext
    try {
        if (_silentSrc) { try { _silentSrc.stop(); } catch(_) {} }
        const sr  = MP.ctx.sampleRate;
        const buf = MP.ctx.createBuffer(1, sr, sr);
        const ch  = buf.getChannelData(0);
        for (let i = 0; i < sr; i++) ch[i] = (Math.random() * 2 - 1) * 1e-10;
        _silentSrc = MP.ctx.createBufferSource();
        _silentSrc.buffer = buf;
        _silentSrc.loop   = true;
        _silentSrc.connect(MP.ctx.destination);
        _silentSrc.start(0);
    } catch(e) {}
    // Каждые 5 секунд — агрессивный resume чтобы не было задержки 15 сек
    clearInterval(_keepTimer);
    _keepTimer = setInterval(() => {
        if (!MP.ctx) return;
        if (MP.ctx.state !== 'running') {
            MP.ctx.resume().catch(() => {});
        }
        // Перезапускаем silent buffer если он остановился
        if (!_silentSrc || (_silentSrc.playbackState !== undefined && _silentSrc.playbackState === 3)) {
            _mpKeepAlive();
        }
    }, 5000); // каждые 5 сек вместо 20!
}
// ── visibilitychange ──
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        _mpStopViz(); // только визуализатор
        // audioEl продолжает играть сам — iOS не трогает чистый HTML5 audio
        return;
    }
    // Вернулись — немедленно resume ctx
    if (MP.ctx && MP.ctx.state !== 'running') {
        MP.ctx.resume().then(() => _mpKeepAlive()).catch(() => {});
    }
    // Если audioEl остановился (очень редко) — возобновляем
    if (MP.playing && MP.audioEl && MP.audioEl.paused && !MP._transitioning) {
        MP.audioEl.play().catch(() => {});
    }
    // Перезапускаем визуализатор
    if (MP.playing) {
        const open = document.getElementById('music-section')?.style.display !== 'none';
        if (open) _mpStartViz();
    }
});

// ══ Открытие плеера ══
async function musicTabOpened() {
    await _mpLoadTracks();
    _mpBuildEqPresets();
    _mpInitEqCanvas();
    if (MP.idx >= 0) _mpUpdateCard();
    _injectMusicButton();
    setTimeout(() => _mpDrawEq(), 80);
    // Синхронизируем публичный список треков с сервером
    _mpSyncTracksToServer();
}

async function _mpSyncTracksToServer() {
    if (!MP.tracks.length) return;
    try {
        await apiFetch('/sync_tracks', {
            method: 'POST',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({
                tracks: MP.tracks.filter(t => !t.isFriendTrack).map(t => ({
                    title:     t.title     || '',
                    artist:    t.artist    || '',
                    duration:  t.duration  || 0,
                    audio_url: t.audio_url || '',
                    cover_url: t.coverUrl  || '',
                }))
            })
        });
    } catch(e) {}
}

async function _mpLoadTracks() {
    try {
        const raw = await _mdbGetAll('tracks');
        MP.tracks = raw.sort((a,b) => (a.title||'').localeCompare(b.title||''));
        _mpRender();
    } catch(e) { console.error('music load:', e); showToast('Ошибка загрузки', 'error'); }
}

// ══ Файловый пикер ══
function musicPickFiles() {
    const inp = document.createElement('input');
    inp.type = 'file';
    // iOS Safari лучше понимает явные MIME types + расширения
    inp.accept = [
        'audio/*',
        'video/mp4','video/quicktime','video/webm','video/x-m4v',
        '.mp3','.flac','.aac','.wav','.ogg','.m4a',
        '.mp4','.mov','.m4v','.webm','.mkv','.3gp',
    ].join(',');
    inp.multiple = true;
    inp.onchange = async e => {
        const files = Array.from(e.target.files || []);
        if (!files.length) return;
        await _mpImportFiles(files);
    };
    inp.click();
}

async function _mpImportFiles(files) {
    let done=0, added=0, errors=0;
    for (const file of files) {
        const name = file.name.replace(/\.[^/.]+$/, '');
        // iOS Safari иногда отдаёт пустой file.type — проверяем и по расширению
        const isVideo = file.type.startsWith('video/') ||
                        file.type === '' && /\.(mp4|mov|webm|avi|mkv|m4v|m4b|3gp)$/i.test(file.name) ||
                        /\.(mp4|mov|m4v|3gp)$/i.test(file.name); // .mov и .mp4 всегда видео
        try {
            if (isVideo) {
                await _mpImportVideo(file, (p, sub) => {
                    _showImportProgress(`🎬 Извлекаю аудио из видео`, p, sub || name);
                });
            } else {
                _showImportProgress(`🎵 Добавляю ${done+1} из ${files.length}`, (done/files.length)*100, name);
                await _mpImportAudio(file);
            }
            added++;
        } catch(e) { console.error('import:', file.name, e); errors++; }
        done++;
    }
    _hideImportProgress();
    await _mpLoadTracks();
    if (added > 0) {
        showToast(`Добавлено ${added} трек${added===1?'':'ов'} 🎵`, 'success');
    } else {
        // Показываем подсказку для iOS
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
                      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        if (isIOS) {
            _mpShowIOSHelp();
        } else {
            showToast('Не удалось добавить файлы', 'error');
        }
    }
}

// ══ Импорт аудио ══
async function _mpImportAudio(file) {
    const tags = await _mpReadID3(file);
    const track = {
        title: tags.title || file.name.replace(/\.[^/.]+$/,''),
        artist: tags.artist || 'Неизвестный',
        album: tags.album || '',
        duration: 0, coverUrl: tags.coverUrl || null,
        isFromVideo: false, size: file.size, addedAt: Date.now(),
        audio_url: '', // заполнится после загрузки на сервер
    };
    const id  = await _mdbPut('tracks', track);
    const buf = await file.arrayBuffer();
    await _mdbPut('blobs', { id, data: buf, mime: file.type || 'audio/mpeg' });

    // Загружаем на сервер — чтобы другие могли добавить этот трек онлайн
    // Передаём оригинальный File объект (не ArrayBuffer)
    _mpUploadTrackToServer(id, file, { ...track, id });
}

// Загружает аудиофайл на сервер (Cloudinary) и обновляет audio_url трека
async function _mpUploadTrackToServer(id, file, track) {
    try {
        const fd = new FormData();
        fd.append('file',     file);
        fd.append('title',    track.title  || '');
        fd.append('artist',   track.artist || '');
        fd.append('duration', track.duration || 0);
        const r = await apiFetch('/upload_track', { method: 'POST', body: fd });
        if (!r?.ok) return;
        const data = await r.json();
        if (!data.ok || !data.url) return;
        // Обновляем трек в IndexedDB
        const updated = { ...track, id, audio_url: data.url, serverTrackId: data.track_id };
        await _mdbPut('tracks', updated);
        // Обновляем в MP.tracks
        const t = MP.tracks.find(t => t.id === id);
        if (t) { t.audio_url = data.url; t.serverTrackId = data.track_id; }
        // Синхронизируем с сервером
        _mpSyncTracksToServer();
    } catch(e) { console.warn('uploadTrack:', e); }
}

// ══ Импорт видео → аудио (надёжный стриминговый метод) ══
async function _mpImportVideo(file, onProgress) {
    onProgress(5, '📂 Читаю файл…');

    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
                  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    // ══ Метод 1: decodeAudioData ══
    // Работает везде включая iOS Safari. На iOS — единственный надёжный метод.
    // Ограничение: файл целиком в RAM. Для больших файлов на iOS всё равно нет альтернативы.
    try {
        onProgress(10, '📖 Читаю файл…');
        const arrBuf = await file.arrayBuffer();
        onProgress(30, '🔊 Декодирую аудио…');

        const AC = window.AudioContext || window.webkitAudioContext;
        const tmpCtx = new AC();
        let audioBuf;
        try {
            // iOS: decodeAudioData не поддерживает Promise-синтаксис в старых версиях,
            // используем callback-обёртку которая работает везде
            audioBuf = await new Promise((res, rej) => {
                tmpCtx.decodeAudioData(
                    arrBuf.slice(0),
                    buf => res(buf),
                    err => rej(err || new Error('decodeAudioData failed'))
                );
            });
        } finally {
            tmpCtx.close().catch(() => {});
        }

        onProgress(70, '💾 Конвертирую в WAV…');
        const wavBlob = _mpToWav(audioBuf);
        const wavBuf  = await wavBlob.arrayBuffer();
        onProgress(90, '📝 Сохраняю…');
        const id = await _mdbPut('tracks', {
            title:       file.name.replace(/\.[^/.]+$/, ''),
            artist:      '🎬 из видео',
            album:       '',
            duration:    audioBuf.duration,
            coverUrl:    null,
            isFromVideo: true,
            size:        wavBuf.byteLength,
            addedAt:     Date.now(),
        });
        await _mdbPut('blobs', { id, data: wavBuf, mime: 'audio/wav' });
        onProgress(100, '✅ Готово');
        return;
    } catch(e) {
        console.warn('decodeAudioData failed:', e.message || e);
        if (isIOS) {
            // На iOS больше нет вариантов — captureStream и MediaRecorder не работают
            throw new Error('iOS: не удалось декодировать видео. Попробуй конвертировать в MP4 (H.264+AAC).');
        }
    }

    // ══ Метод 2: MediaRecorder — только для Android/Desktop ══
    // На iOS captureStream() не существует
    onProgress(8, '🎬 Стриминговый режим…');
    await _mpImportVideoStream(file, onProgress);
}

// Стриминговый захват аудио — не грузит файл целиком в RAM
async function _mpImportVideoStream(file, onProgress) {
    return new Promise((resolve, reject) => {
        const objUrl = URL.createObjectURL(file);
        const video  = document.createElement('video');
        video.src     = objUrl;
        video.preload = 'metadata';
        video.muted   = false;
        video.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0';
        document.body.appendChild(video);

        const cleanup = () => {
            try { document.body.removeChild(video); } catch(e) {}
            URL.revokeObjectURL(objUrl);
        };

        video.onerror = () => { cleanup(); reject(new Error('Видео не поддерживается браузером')); };

        video.onloadedmetadata = () => {
            const duration = video.duration || 0;
            onProgress(12, `🎙 Длительность: ${_mpFmt(duration)}`);

            // captureStream — стримим напрямую, без загрузки всего файла
            let stream;
            try {
                stream = video.captureStream ? video.captureStream() : video.mozCaptureStream ? video.mozCaptureStream() : null;
            } catch(e) { stream = null; }

            if (!stream) { cleanup(); reject(new Error('captureStream не поддерживается')); return; }

            const audioTracks = stream.getAudioTracks();
            if (!audioTracks.length) { cleanup(); reject(new Error('В видео нет аудиодорожки')); return; }

            const audioStream = new MediaStream(audioTracks);

            // Выбираем лучший поддерживаемый формат
            const mimeType = [
                'audio/webm;codecs=opus',
                'audio/webm',
                'audio/ogg;codecs=opus',
                'audio/ogg',
                'audio/mp4',
            ].find(m => { try { return MediaRecorder.isTypeSupported(m); } catch(e) { return false; } }) || '';

            let recorder;
            try {
                recorder = mimeType ? new MediaRecorder(audioStream, { mimeType }) : new MediaRecorder(audioStream);
            } catch(e) { cleanup(); reject(new Error('MediaRecorder недоступен')); return; }

            const chunks = [];
            recorder.ondataavailable = e => { if (e.data && e.data.size > 0) chunks.push(e.data); };

            recorder.onstop = async () => {
                clearInterval(progressTick);
                clearTimeout(safetyTimeout);
                try {
                    if (!chunks.length) throw new Error('Нет данных — видео без звука?');
                    const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/webm' });
                    onProgress(92, '📝 Сохраняю в библиотеку…');
                    const buf = await blob.arrayBuffer();
                    const id  = await _mdbPut('tracks', {
                        title: file.name.replace(/\.[^/.]+$/,''),
                        artist: '🎬 из видео', album: '',
                        duration,
                        coverUrl: null, isFromVideo: true,
                        size: buf.byteLength, addedAt: Date.now(),
                    });
                    await _mdbPut('blobs', { id, data: buf, mime: blob.type });
                    cleanup();
                    onProgress(100, '✅ Готово');
                    resolve();
                } catch(e) { cleanup(); reject(e); }
            };
            recorder.onerror = e => { cleanup(); reject(e.error || new Error('Ошибка записи')); };

            // Старт
            recorder.start(1000); // чанки каждую секунду
            video.play().catch(() => {
                // Autoplay заблокирован? Пробуем через пользовательское взаимодействие
                // На iOS обязательно нужен user gesture — но мы уже внутри onchange файлового input
            });

            // Прогресс-тикер
            const progressTick = setInterval(() => {
                if (duration > 0 && video.currentTime > 0) {
                    const frac = video.currentTime / duration;
                    onProgress(12 + frac * 78, `🎙 ${Math.round(frac*100)}% · ${_mpFmt(video.currentTime)} / ${_mpFmt(duration)}`);
                }
            }, 800);

            // Таймаут безопасности: duration + 10 сек
            const safetyTimeout = setTimeout(() => {
                if (recorder.state === 'recording') recorder.stop();
            }, (duration > 0 ? duration : 600) * 1000 + 10000);

            video.onended = () => {
                if (recorder.state === 'recording') recorder.stop();
            };

            // Если видео длинное — прогресс может зависнуть, следим
            video.onerror = () => {
                clearInterval(progressTick);
                clearTimeout(safetyTimeout);
                if (recorder.state === 'recording') recorder.stop();
            };
        };
    });
}

// ══ Подсказка iOS ══
function _mpShowIOSHelp() {
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;inset:0;z-index:9000;background:rgba(0,0,0,.85);backdrop-filter:blur(16px);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;text-align:center';
    d.innerHTML = `
        <div style="font-size:40px;margin-bottom:16px">⚠️</div>
        <div style="font-size:18px;font-weight:800;margin-bottom:12px">Не удалось прочитать файл</div>
        <div style="font-size:14px;color:rgba(255,255,255,.6);line-height:1.6;margin-bottom:24px">
            Убедись что видео в формате <b style="color:white">MP4</b> (H.264 + AAC).<br>
            Файлы записанные камерой iPhone обычно работают.<br>
            <br>
            Если проблема остаётся — попробуй добавить<br>аудио файл напрямую (MP3, AAC, M4A).
        </div>
        <button onclick="this.parentNode.remove()" style="padding:13px 32px;background:var(--accent);border:none;border-radius:14px;color:#000;font-size:15px;font-weight:800;cursor:pointer;font-family:inherit">Понятно</button>`;
    document.body.appendChild(d);
}

// ══ PCM → WAV с умным даунсемплингом для экономии памяти на iOS ══
function _mpToWav(buf) {
    // На iOS ограниченная RAM — конвертируем в моно 44100Hz если стерео/высокий rate
    const srcRate = buf.sampleRate;
    const outRate = srcRate > 44100 ? 44100 : srcRate;
    const outCh   = 1; // всегда моно — вдвое меньше памяти, для музыки достаточно

    const srcFrames = buf.length;
    // Ресемплинг: линейная интерполяция
    const ratio     = srcRate / outRate;
    const outFrames = Math.ceil(srcFrames / ratio);

    // Смешиваем все каналы в моно
    const srcL = buf.getChannelData(0);
    const srcR = buf.numberOfChannels > 1 ? buf.getChannelData(1) : srcL;

    const bytes = outFrames * outCh * 2;
    const ab    = new ArrayBuffer(44 + bytes);
    const v     = new DataView(ab);
    const s     = (str, off) => { for(let i=0;i<str.length;i++) v.setUint8(off+i, str.charCodeAt(i)); };

    s('RIFF',0); v.setUint32(4, 36+bytes, true);
    s('WAVE',8); s('fmt ',12);
    v.setUint32(16,16,true); v.setUint16(20,1,true); v.setUint16(22,outCh,true);
    v.setUint32(24,outRate,true); v.setUint32(28,outRate*outCh*2,true);
    v.setUint16(32,outCh*2,true); v.setUint16(34,16,true);
    s('data',36); v.setUint32(40,bytes,true);

    let off = 44;
    for (let i = 0; i < outFrames; i++) {
        const srcIdx = i * ratio;
        const lo = Math.floor(srcIdx);
        const hi = Math.min(lo + 1, srcFrames - 1);
        const frac = srcIdx - lo;
        // Линейная интерполяция + микс L+R в моно
        const lSample = srcL[lo] + (srcL[hi] - srcL[lo]) * frac;
        const rSample = srcR[lo] + (srcR[hi] - srcR[lo]) * frac;
        const mono    = Math.max(-1, Math.min(1, (lSample + rSample) * 0.5));
        v.setInt16(off, mono < 0 ? mono * 0x8000 : mono * 0x7FFF, true);
        off += 2;
    }
    return new Blob([ab], { type: 'audio/wav' });
}

// ══ ID3 tags ══
async function _mpReadID3(file) {
    const r={title:'',artist:'',album:'',coverUrl:null};
    try {
        const ab=await file.slice(0,256*1024).arrayBuffer();
        const b=new Uint8Array(ab);
        if(b[0]===73&&b[1]===68&&b[2]===51){
            const dv=new DataView(ab);
            const sz=((b[6]&0x7f)<<21)|((b[7]&0x7f)<<14)|((b[8]&0x7f)<<7)|(b[9]&0x7f);
            let p=10;
            while(p<sz+10&&p+10<ab.byteLength){
                const id=String.fromCharCode(b[p],b[p+1],b[p+2],b[p+3]);
                const fs=new DataView(ab).getUint32(p+4);
                if(!fs||fs>2e6)break;
                const fd=b.slice(p+10,p+10+fs);
                if(['TIT2','TPE1','TALB'].includes(id)){
                    const enc=fd[0];
                    const raw=enc===1?new TextDecoder('utf-16').decode(fd.slice(1)):new TextDecoder('latin1').decode(fd.slice(1));
                    const val=raw.replace(/\0/g,'').trim();
                    if(id==='TIT2')r.title=val;else if(id==='TPE1')r.artist=val;else r.album=val;
                }else if(id==='APIC'){
                    const me=fd.indexOf(0,1),is=fd.indexOf(0,me+2)+1;
                    if(is>0&&is<fd.length){
                        const mime=new TextDecoder().decode(fd.slice(1,me))||'image/jpeg';
                        r.coverUrl=URL.createObjectURL(new Blob([fd.slice(is)],{type:mime}));
                    }
                }
                p+=10+fs;
            }
        }
    }catch(e){}
    return r;
}

// ══ Canvas EQ — перетаскиваемые точки с кривой ══
function _mpInitEqCanvas() {
    const canvas = document.getElementById('eq-canvas');
    if (!canvas || canvas._mpInit) return;
    canvas._mpInit = true;

    function getPos(e) {
        const rect = canvas.getBoundingClientRect();
        const t = e.touches ? (e.touches[0] || e.changedTouches[0]) : e;
        return {
            x: Math.max(0, Math.min(1, (t.clientX - rect.left) / rect.width)),
            y: Math.max(0, Math.min(1, (t.clientY - rect.top)  / rect.height)),
        };
    }

    function yToGain(y) { return (0.5 - y) * 24; }   // y=0 → +12dB, y=1 → -12dB
    function gainToY(g) { return 0.5 - g / 24; }      // нормализованная позиция точки
    function bandToX(i) { return (i + 0.5) / EQ_FREQS.length; }

    function findBand(x, y) {
        // Ищем ближайшую точку. По X — жёсткие зоны (каждая полоса = 1/N ширины)
        // По Y — хит-зона ±0.25 (большая, чтобы легко попадать пальцем)
        const bandIdx = Math.floor(x * EQ_FREQS.length);
        const i = Math.max(0, Math.min(EQ_FREQS.length - 1, bandIdx));
        const by = gainToY(MP.eqGains[i]);
        return Math.abs(y - by) < 0.3 ? i : -1;
    }

    function onStart(e) {
        e.preventDefault();
        const pos  = getPos(e);
        const band = findBand(pos.x, pos.y);
        if (band < 0) return;
        MP.eqDragging = band;
        if (!MP.ctx && MP.audioEl) _initWebAudio();
        if (!MP.eqEnabled) { MP.eqEnabled = true; _mpEqToggleUI(true); _mpApplyEqToFilters(); }
        _mpDrawEq();
    }

    function onMove(e) {
        e.preventDefault();
        if (MP.eqDragging < 0) return;
        const pos  = getPos(e);
        const gain = Math.round(Math.max(-12, Math.min(12, yToGain(pos.y))) * 2) / 2;
        MP.eqGains[MP.eqDragging] = gain;
        const f = MP.eqFilters[MP.eqDragging];
        if (f) f.gain.value = MP.eqEnabled ? gain : 0;
        document.querySelectorAll('.eq-preset-btn').forEach(b => _mpEqPresetStyle(b, false));
        _mpDrawEq();
    }

    function onEnd() { MP.eqDragging = -1; _mpDrawEq(); }

    canvas.addEventListener('touchstart',  onStart, { passive: false });
    canvas.addEventListener('touchmove',   onMove,  { passive: false });
    canvas.addEventListener('touchend',    onEnd,   { passive: false });
    canvas.addEventListener('touchcancel', onEnd,   { passive: false });
    canvas.addEventListener('mousedown',   onStart);
    canvas.addEventListener('mousemove',   e => { if (e.buttons) onMove(e); });
    canvas.addEventListener('mouseup',     onEnd);
    canvas.addEventListener('mouseleave',  onEnd);

    // Первый draw — canvas может быть скрыт, но draw всё равно вызовем
    // Реальный resize произойдёт в _mpDrawEq каждый раз
    setTimeout(() => _mpDrawEq(), 50);
}

function _mpDrawEq() {
    const canvas = document.getElementById('eq-canvas');
    if (!canvas) return;

    // ── Авто-resize: каждый раз берём актуальные размеры ──
    const dpr  = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const cssW = rect.width  || canvas.offsetWidth  || canvas.parentElement?.offsetWidth  || 300;
    const cssH = rect.height || canvas.offsetHeight || 200;
    if (canvas.width  !== Math.round(cssW * dpr) ||
        canvas.height !== Math.round(cssH * dpr)) {
        canvas.width  = Math.round(cssW * dpr);
        canvas.height = Math.round(cssH * dpr);
    }

    const W = canvas.width, H = canvas.height;
    if (!W || !H) return; // ещё скрыт — пробуем позже

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, W, H);

    const N       = EQ_FREQS.length;
    const bandToX = i => (i + 0.5) / N * W;
    const gainToY = g => (0.5 - g / 24) * H;

    // ── Сетка ──
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    [-12, -6, 0, 6, 12].forEach(db => {
        const y = gainToY(db);
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    });
    for (let i = 0; i < N; i++) {
        const x = bandToX(i);
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }

    // ── Нулевая линия ──
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(0, gainToY(0)); ctx.lineTo(W, gainToY(0)); ctx.stroke();
    ctx.setLineDash([]);

    // ── Точки кривой ──
    const pts = Array.from({length: N}, (_, i) => ({
        x: bandToX(i),
        y: gainToY(MP.eqGains[i]),
    }));

    // Градиент под кривой
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0,   'rgba(139,92,246,0.4)');
    grad.addColorStop(0.6, 'rgba(99,102,241,0.12)');
    grad.addColorStop(1,   'rgba(99,102,241,0)');

    // ── Catmull-Rom сплайн ──
    function drawSpline(close) {
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 0; i < pts.length - 1; i++) {
            const p0 = pts[Math.max(0, i-1)];
            const p1 = pts[i];
            const p2 = pts[i+1];
            const p3 = pts[Math.min(pts.length-1, i+2)];
            const cp1x = p1.x + (p2.x - p0.x) / 6;
            const cp1y = p1.y + (p2.y - p0.y) / 6;
            const cp2x = p2.x - (p3.x - p1.x) / 6;
            const cp2y = p2.y - (p3.y - p1.y) / 6;
            ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
        }
        if (close) {
            ctx.lineTo(pts[N-1].x, H);
            ctx.lineTo(pts[0].x, H);
            ctx.closePath();
        }
    }

    // Заливка
    drawSpline(true);
    ctx.fillStyle = grad;
    ctx.fill();

    // Линия
    drawSpline(false);
    ctx.strokeStyle = MP.eqEnabled ? '#a78bfa' : 'rgba(167,139,250,0.3)';
    ctx.lineWidth = 2.5 * dpr;
    ctx.stroke();

    // ── Точки ──
    pts.forEach((pt, i) => {
        const active = MP.eqDragging === i;
        const gain   = MP.eqGains[i];
        const zeroY  = gainToY(0);

        // Вертикальная линия к нулю
        if (Math.abs(gain) > 0.4) {
            ctx.strokeStyle = gain > 0 ? 'rgba(167,139,250,0.5)' : 'rgba(129,140,248,0.5)';
            ctx.lineWidth = 1.5 * dpr;
            ctx.beginPath();
            ctx.moveTo(pt.x, pt.y);
            ctx.lineTo(pt.x, zeroY);
            ctx.stroke();
        }

        // Свечение активной точки
        ctx.shadowColor = active ? '#a78bfa' : 'transparent';
        ctx.shadowBlur  = active ? 14 * dpr : 0;

        const r = (active ? 11 : 7) * dpr;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
        ctx.fillStyle = active ? '#c4b5fd' : (MP.eqEnabled ? 'white' : 'rgba(255,255,255,0.4)');
        ctx.fill();

        ctx.shadowBlur  = 0;
        ctx.shadowColor = 'transparent';

        // Значение dB
        if (Math.abs(gain) >= 1) {
            ctx.font = `bold ${Math.round(10 * dpr)}px -apple-system,sans-serif`;
            ctx.textAlign = 'center';
            ctx.fillStyle = gain > 0 ? '#c4b5fd' : '#f87171';
            const label = (gain > 0 ? '+' : '') + gain;
            const textY = pt.y < H * 0.2 ? pt.y + 18 * dpr : pt.y - 13 * dpr;
            ctx.fillText(label, pt.x, textY);
        }
    });
}
function _mpApplyEqToFilters() {
    MP.eqGains.forEach((db, i) => {
        if (MP.eqFilters[i]) MP.eqFilters[i].gain.value = MP.eqEnabled ? db : 0;
    });
}

// ══ Рендер треков ══
function _mpRender(filter) {
    if (filter === undefined) filter = MP.filterQuery || '';
    const list   = document.getElementById('music-track-list');
    const empty  = document.getElementById('music-empty-state');
    const player = document.getElementById('music-player-card');
    const eq     = document.getElementById('music-eq-section');
    const cnt    = document.getElementById('music-track-count');
    if (!list) return;

    const q = filter.toLowerCase().trim();
    const visible = q ? MP.tracks.filter(t=>(t.title+' '+t.artist).toLowerCase().includes(q)) : MP.tracks;

    if (cnt) cnt.textContent = `${MP.tracks.length} трек${MP.tracks.length===1?'':'ов'}`;
    const sub = document.getElementById('music-btn-subtitle');
    if (sub) sub.textContent = MP.tracks.length
        ? `${MP.tracks.length} треков${MP.playing?' · ▶ играет':''}`
        : 'Открыть плеер';

    if (player) player.style.display = MP.idx >= 0 ? '' : 'none';
    // eq-section управляется только через musicShowEQ()

    if (!visible.length) {
        list.innerHTML = '';
        if (empty) empty.style.display = '';
        return;
    }
    if (empty) empty.style.display = 'none';

    list.innerHTML = '';
    visible.forEach(track => {
        const isCur = MP.idx >= 0 && track.id === MP.tracks[MP.idx]?.id;
        const row = document.createElement('div');
        row.style.cssText = [
            'display:flex;align-items:center;gap:12px',
            'padding:10px 12px;border-radius:16px;margin-bottom:3px',
            'cursor:pointer;-webkit-tap-highlight-color:transparent',
            isCur ? 'background:rgba(16,185,129,.1);border:.5px solid rgba(16,185,129,.22)' : 'border:.5px solid transparent',
            'transition:background .12s',
        ].join(';');

        const cov = document.createElement('div');
        cov.style.cssText = 'width:50px;height:50px;border-radius:13px;flex-shrink:0;overflow:hidden;position:relative;background:rgba(255,255,255,.06);display:flex;align-items:center;justify-content:center';
        if (track.coverUrl) {
            cov.innerHTML = `<img src="${track.coverUrl}" style="width:100%;height:100%;object-fit:cover" loading="lazy">`;
        } else if (track.isFriendTrack) {
            // Чужой трек без файла — иконка загрузки
            cov.style.background = 'rgba(16,185,129,.1)';
            cov.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" stroke="#10b981" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                <polyline points="7 10 12 15 17 10" stroke="#10b981" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                <line x1="12" y1="15" x2="12" y2="3" stroke="#10b981" stroke-width="1.8" stroke-linecap="round"/>
            </svg>`;
        } else {
            const hue = ((track.title||'?').charCodeAt(0) * 41) % 360;
            cov.style.background = `linear-gradient(135deg,hsl(${hue},60%,22%),hsl(${hue+40},60%,18%))`;
            cov.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path d="M9 18V5l12-2v13" stroke="hsl(${hue},70%,70%)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                <circle cx="6" cy="18" r="3" stroke="hsl(${hue},70%,70%)" stroke-width="1.8"/>
                <circle cx="18" cy="16" r="3" stroke="hsl(${hue},70%,70%)" stroke-width="1.8"/>
            </svg>`;
        }
        if (isCur && MP.playing) {
            const bars = document.createElement('div');
            bars.style.cssText = 'position:absolute;inset:0;background:rgba(0,0,0,.52);display:flex;align-items:center;justify-content:center;gap:2px';
            [10,17,13].forEach((h,i) => {
                const b = document.createElement('div');
                b.style.cssText = `width:3px;height:${h}px;background:var(--accent);border-radius:2px;animation:mpBar${i} .7s ease-in-out infinite alternate`;
                bars.appendChild(b);
            });
            cov.appendChild(bars);
        }

        const info = document.createElement('div');
        info.style.cssText = 'flex:1;min-width:0';
        const subtitleText = track.isFriendTrack
            ? '<span style="color:rgba(16,185,129,.7)">↓ Нажми ⋮ чтобы загрузить файл</span>'
            : escHtml(track.artist||'');
        info.innerHTML = `
            <div style="font-size:14px;font-weight:${isCur?'800':'600'};color:${isCur?'var(--accent)':'#fff'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.3">${escHtml(track.title||'Без названия')}</div>
            <div style="font-size:12px;color:rgba(255,255,255,.38);margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${subtitleText}</div>`;

        const right = document.createElement('div');
        right.style.cssText = 'display:flex;align-items:center;gap:6px;flex-shrink:0';
        if (track.duration > 0) {
            const span = document.createElement('span');
            span.style.cssText = 'font-size:11px;color:rgba(255,255,255,.25)';
            span.textContent = _mpFmt(track.duration);
            right.appendChild(span);
        }
        const del = document.createElement('button');
        del.style.cssText = 'width:30px;height:30px;border-radius:50%;background:rgba(255,255,255,.05);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,.35);-webkit-tap-highlight-color:transparent';
        del.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="5" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="19" r="1.5" fill="currentColor"/></svg>';
        del.onclick = e => { e.stopPropagation(); showTrackMenu(track); };
        right.appendChild(del);

        row.appendChild(cov); row.appendChild(info); row.appendChild(right);
        const trackIdx = MP.tracks.indexOf(track);
        row.addEventListener('click', () => musicPlayAt(trackIdx));
        row.addEventListener('pointerdown',  () => row.style.background = isCur ? 'rgba(16,185,129,.16)' : 'rgba(255,255,255,.05)');
        row.addEventListener('pointerup',    () => row.style.background = isCur ? 'rgba(16,185,129,.1)' : '');
        row.addEventListener('pointerleave', () => row.style.background = isCur ? 'rgba(16,185,129,.1)' : '');
        list.appendChild(row);
    });

    // Обновляем карточку "сейчас играет" в профиле
    _mpUpdateProfileCard();
}
function _renderTrackList(f) { _mpRender(f); }

// ══ Воспроизведение ══
async function musicPlayAt(idx) {
    if (idx < 0 || idx >= MP.tracks.length) return;
    if (MP._transitioning) return;
    MP._transitioning = true;

    _initAudioEl();
    _mpStopViz(); // останавливаем визуализатор

    try { MP.audioEl.pause(); } catch(e) {}
    MP.playing = false;

    MP.idx = idx;
    const track = MP.tracks[idx];
    try {
        // Определяем источник: локальный blob или online URL
        let playUrl = null;

        if (track.audio_url) {
            // Приоритет — онлайн URL (и для своих и для чужих треков)
            // Проверяем есть ли локальный blob (быстрее если есть)
            const rec = await _mdbGet('blobs', track.id).catch(() => null);
            if (rec?.data && !track.isFriendTrack) {
                playUrl = URL.createObjectURL(new Blob([rec.data], { type: rec.mime || 'audio/mpeg' }));
            } else {
                playUrl = track.audio_url; // стримим онлайн
            }
        } else if (track.isFriendTrack) {
            // Нет URL — пробуем получить с сервера
            try {
                const r = await apiFetch('/get_track_url/' + track.serverTrackId);
                if (r?.ok) {
                    const d = await r.json();
                    if (d.url) {
                        track.audio_url = d.url;
                        await _mdbPut('tracks', track).catch(() => {});
                        playUrl = d.url;
                    }
                }
            } catch(e) {}
            if (!playUrl) {
                MP._transitioning = false;
                showToast('Трек недоступен онлайн', 'error');
                return;
            }
        } else {
            // Локальный трек — из IndexedDB
            const rec = await _mdbGet('blobs', track.id);
            if (!rec || !rec.data) {
                showToast('Файл не найден', 'error');
                MP._transitioning = false;
                return;
            }
            playUrl = URL.createObjectURL(new Blob([rec.data], { type: rec.mime || 'audio/mpeg' }));
        }

        const oldUrl = MP.audioEl.getAttribute('src');
        MP.audioEl.removeAttribute('src');
        if (oldUrl && oldUrl.startsWith('blob:')) URL.revokeObjectURL(oldUrl);

        MP.audioEl.src = playUrl;
        MP.audioEl.load();

        // PLAY — audioEl полностью независим от AudioContext
        // iOS не может заглушить чистый HTML5 audio в фоне
        await MP.audioEl.play();

        // AudioContext инициализируем ПОСЛЕ play() (нужен user gesture)
        // Используется только для EQ-визуализации, НЕ для воспроизведения
        if (!MP.ctx) _initWebAudio();
        if (MP.ctx && MP.ctx.state !== 'running') MP.ctx.resume().catch(() => {});

        MP.playing = true;
        MP._transitioning = false;
        _mmpHidden = false;

        if (!track.duration && MP.audioEl.duration > 0) {
            track.duration = MP.audioEl.duration;
            _mdbPut('tracks', track).catch(() => {});
        }
        _mpUpdateCard();
        _mpRender();
        _mpStartViz();
        _mpSetMediaSession(track);
        _mpUpdateMiniPlayer();

    } catch(e) {
        MP._transitioning = false;
        if (e.name === 'AbortError') return;
        console.error('playAt:', e.name, e.message);
        showToast('Не удалось воспроизвести', 'error');
        MP.playing = false;
        _mpUpdateCard();
        _mpUpdateMiniPlayer();
    }
}

function _mpSetMediaSession(track) {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
        title:  track.title  || 'Трек',
        artist: track.artist || 'WayChat Music',
        album:  track.album  || '',
        artwork: track.coverUrl ? [{ src: track.coverUrl, sizes: '512x512' }] : [
            { src: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 24 24"><rect width="24" height="24" fill="%230a0a0e"/><path d="M9 18V5l12-2v13" stroke="%2310b981" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="6" cy="18" r="3" stroke="%2310b981" stroke-width="1.5"/><circle cx="18" cy="16" r="3" stroke="%2310b981" stroke-width="1.5"/></svg>', sizes: '512x512', type: 'image/svg+xml' }
        ],
    });
    navigator.mediaSession.playbackState = 'playing';
}

function musicTogglePlay() {
    if (!MP.audioEl || MP.idx < 0) return;
    if (MP._transitioning) return;

    if (MP.playing) {
        MP.playing = false;
        MP.audioEl.pause();
        _mpStopViz();
        _mpUpdateCard();
        _mpUpdateMiniPlayer();
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
    } else {
        MP.audioEl.volume = MP.volume;
        MP.audioEl.play()
            .then(() => {
                if (!MP.ctx) _initWebAudio();
                if (MP.ctx && MP.ctx.state !== 'running') MP.ctx.resume().catch(() => {});
                MP.playing = true;
                _mpStartViz();
                _mpUpdateCard();
                _mpUpdateMiniPlayer();
                if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
            })
            .catch(e => {
                if (e.name !== 'AbortError') {
                    console.warn('play rejected:', e.name);
                    MP.playing = false;
                    _mpUpdateCard();
                    _mpUpdateMiniPlayer();
                }
            });
    }
}
function musicNext() {
    if (!MP.tracks.length) return;
    musicPlayAt(MP.shuffle ? Math.floor(Math.random()*MP.tracks.length) : (MP.idx+1)%MP.tracks.length);
}
function musicPrev() {
    if (!MP.tracks.length) return;
    if (MP.audioEl && MP.audioEl.currentTime > 3) { MP.audioEl.currentTime = 0; return; }
    musicPlayAt((MP.idx - 1 + MP.tracks.length) % MP.tracks.length);
}
function musicToggleShuffle() {
    MP.shuffle = !MP.shuffle;
    const btn = document.getElementById('mpc-shuffle-btn');
    if (btn) { btn.style.color = MP.shuffle ? 'var(--accent)' : 'rgba(255,255,255,.4)'; btn.style.background = MP.shuffle ? 'rgba(16,185,129,.15)' : 'rgba(255,255,255,.07)'; }
    showToast(MP.shuffle ? 'Перемешивание вкл 🔀' : 'Перемешивание выкл', 'info');
}
function musicToggleRepeat() {
    MP.repeat = !MP.repeat;
    const btn = document.getElementById('mpc-repeat-btn');
    if (btn) { btn.style.color = MP.repeat ? 'var(--accent)' : 'rgba(255,255,255,.4)'; btn.style.background = MP.repeat ? 'rgba(16,185,129,.15)' : 'rgba(255,255,255,.07)'; }
    showToast(MP.repeat ? 'Повтор вкл 🔁' : 'Повтор выкл', 'info');
}
function musicSetVolume(v) {
    MP.volume = v/100;
    if (MP.audioEl) MP.audioEl.volume = MP.volume;
    // gainNode если есть — синхронизируем для визуализатора
    if (MP.gainNode) MP.gainNode.gain.value = MP.volume;
}
function musicSeek(e, wrap) {
    if (!MP.audioEl || !MP.audioEl.duration) return;
    const r = wrap.getBoundingClientRect();
    const t = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * MP.audioEl.duration;
    MP.audioEl.currentTime = t;
}
let _seekDragging = false;
function _mpSeekStart(e, wrap) { e.preventDefault(); _seekDragging=true; _mpSeekApply(e.touches[0], wrap); }
function _mpSeekMove(e, wrap)  { if (!_seekDragging) return; e.preventDefault(); _mpSeekApply(e.touches[0], wrap); }
function _mpSeekEnd()          { _seekDragging = false; }
function _mpSeekApply(touch, wrap) {
    if (!MP.audioEl?.duration) return;
    const r = wrap.getBoundingClientRect();
    const t = Math.max(0, Math.min(1, (touch.clientX - r.left) / r.width)) * MP.audioEl.duration;
    MP.audioEl.currentTime = t;
    const bar = document.getElementById('mpc-prog-bar');
    if (bar) bar.style.width = ((t / MP.audioEl.duration) * 100) + '%';
}
function musicSearch(q) { MP.filterQuery = q; _mpRender(q); }

function showTrackMenu(track) {
    const ov = document.createElement('div');
    ov.className = 'modal-overlay';
    ov.onclick = e => { if (e.target===ov) ov.remove(); };
    const sh = document.createElement('div');
    sh.className = 'modal-sheet';

    // Для чужих треков (без файла) — специальное меню
    const friendRows = track.isFriendTrack ? `
        <div onclick="ov.remove();musicPickFiles()" style="display:flex;align-items:center;gap:14px;padding:15px 18px;cursor:pointer;border-bottom:.5px solid rgba(255,255,255,.07)">
            <div style="width:36px;height:36px;border-radius:10px;background:rgba(16,185,129,.15);display:flex;align-items:center;justify-content:center">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </div>
            <div>
                <span style="font-size:16px;font-weight:500;color:#10b981">Загрузить файл</span>
                <div style="font-size:12px;color:rgba(255,255,255,.35);margin-top:2px">Загрузи MP3 чтобы слушать</div>
            </div>
        </div>` : `
        <div onclick="renameTrack(${track.id});this.closest('.modal-overlay').remove()" style="display:flex;align-items:center;gap:14px;padding:15px 18px;cursor:pointer;border-bottom:.5px solid rgba(255,255,255,.07)">
            <div style="width:36px;height:36px;border-radius:10px;background:rgba(99,102,241,.2);display:flex;align-items:center;justify-content:center">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M17 3a2.828 2.828 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z" stroke="#818cf8" stroke-width="2" stroke-linecap="round"/></svg>
            </div>
            <span style="font-size:16px;font-weight:500">Переименовать</span>
        </div>
        <div onclick="_sendTrackToChat(${track.id});this.closest('.modal-overlay').remove()" style="display:flex;align-items:center;gap:14px;padding:15px 18px;cursor:pointer;border-bottom:.5px solid rgba(255,255,255,.07)">
            <div style="width:36px;height:36px;border-radius:10px;background:rgba(52,211,153,.15);display:flex;align-items:center;justify-content:center">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z" stroke="#34d399" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </div>
            <span style="font-size:16px;font-weight:500;color:#34d399">Отправить в чат</span>
        </div>`;

    sh.innerHTML = `<div class="modal-handle"></div>
        <div style="padding:4px 0 12px;font-size:13px;font-weight:700;color:rgba(255,255,255,.4);letter-spacing:.5px;text-align:center">
            ${escHtml(track.title||'Трек')}
            ${track.isFriendTrack ? '<span style="font-size:10px;background:rgba(16,185,129,.15);color:#10b981;padding:2px 8px;border-radius:20px;margin-left:6px;font-weight:600">из профиля</span>' : ''}
        </div>
        <div style="background:rgba(255,255,255,.05);border-radius:18px;overflow:hidden;margin-bottom:10px">
            ${friendRows}
            <div onclick="musicDeleteTrack(${track.id});this.closest('.modal-overlay').remove()" style="display:flex;align-items:center;gap:14px;padding:15px 18px;cursor:pointer">
                <div style="width:36px;height:36px;border-radius:10px;background:rgba(239,68,68,.15);display:flex;align-items:center;justify-content:center">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke="#ef4444" stroke-width="2" stroke-linecap="round"/></svg>
                </div>
                <span style="font-size:16px;font-weight:500;color:#ef4444">Удалить</span>
            </div>
        </div>`;
    ov.appendChild(sh); document.body.appendChild(ov);
}

function _sendTrackToChat(trackId) {
    const track = MP.tracks.find(t => t.id === trackId);
    if (!track) return;

    const ov = document.createElement('div');
    ov.className = 'modal-overlay';
    ov.onclick = e => { if (e.target === ov) ov.remove(); };
    const sh = document.createElement('div');
    sh.className = 'modal-sheet';
    sh.style.cssText = 'max-height:80vh;overflow-y:auto';

    const chats = recentChats || [];
    sh.innerHTML = `<div class="modal-handle"></div>
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
            <div style="width:44px;height:44px;border-radius:12px;background:rgba(124,58,237,.2);display:flex;align-items:center;justify-content:center;flex-shrink:0">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M9 18V5l12-2v13" stroke="#a78bfa" stroke-width="1.8" stroke-linecap="round"/><circle cx="6" cy="18" r="3" stroke="#a78bfa" stroke-width="1.8"/><circle cx="18" cy="16" r="3" stroke="#a78bfa" stroke-width="1.8"/></svg>
            </div>
            <div>
                <div style="font-size:15px;font-weight:700">${escHtml(track.title||'Трек')}</div>
                <div style="font-size:12px;color:rgba(255,255,255,.4)">${escHtml(track.artist||'')}</div>
            </div>
        </div>
        <div style="font-size:13px;color:rgba(255,255,255,.4);margin-bottom:10px">Выбери чат для отправки:</div>
        <div style="background:rgba(255,255,255,.04);border-radius:16px;overflow:hidden">
            ${chats.slice(0,20).map((c,i) => {
                const pid  = c.partner_id || c.id;
                const name = c.partner_name || c.name || 'Чат';
                const ava  = c.partner_avatar || '';
                return `<div data-track="${trackId}" data-chatid="${c.chat_id||c.id}" data-name="${escHtml(name)}"
                    onclick="_doSendTrack(this)"
                    style="display:flex;align-items:center;gap:12px;padding:12px 14px;cursor:pointer;${i<chats.length-1?'border-bottom:.5px solid rgba(255,255,255,.06)':''}">
                    ${ava ? `<img src="${ava}" style="width:40px;height:40px;border-radius:50%;object-fit:cover;flex-shrink:0">` :
                            `<div style="width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,.1);display:flex;align-items:center;justify-content:center;font-size:17px;font-weight:700;flex-shrink:0">${escHtml(name[0]||'?')}</div>`}
                    <span style="font-size:15px;font-weight:600">${escHtml(name)}</span>
                </div>`;
            }).join('')}
        </div>`;

    ov.appendChild(sh);
    document.body.appendChild(ov);
    window._trackSendOv = ov;
}

async function _doSendTrack(el) {
    const trackId = parseInt(el.dataset.track);
    const chatId  = parseInt(el.dataset.chatid);
    const name    = el.dataset.name;
    const track   = MP.tracks.find(t => t.id === trackId);
    if (!track || !chatId) return;

    // Получаем blob из IndexedDB и загружаем на сервер
    try {
        const rec = await _mdbGet('blobs', track.id);
        if (!rec?.data) {
            // Нет локального файла — пробуем через URL
            if (track.audio_url) {
                // Отправляем URL напрямую как аудио-сообщение
                window._trackSendOv?.remove();
                socket.emit('send_message', {
                    chat_id:   chatId,
                    type_msg:  'audio',
                    file_url:  track.audio_url,
                    content:   `🎵 ${track.title||'Трек'}${track.artist ? ' — '+track.artist : ''}`,
                    sender_id: currentUser.id,
                });
                showToast(`Отправлено → ${name} 🎵`, 'success');
                return;
            }
            showToast('Файл не найден', 'error');
            return;
        }
        const blob = new Blob([rec.data], { type: rec.mime || 'audio/mpeg' });
        const file = new File([blob], (track.title||'track')+'.mp3', { type: blob.type });

        window._trackSendOv?.remove();
        showToast('Загружаю...', 'info');

        const fd = new FormData();
        fd.append('file', file);
        fd.append('chat_id', chatId);

        const r = await apiFetch('/upload_media', { method:'POST', body: fd });
        if (!r?.ok) throw new Error('upload failed');
        const data = await r.json();

        socket.emit('send_message', {
            chat_id:   chatId,
            type_msg:  'audio',
            file_url:  data.url,
            content:   `🎵 ${track.title||'Трек'}${track.artist ? ' — '+track.artist : ''}`,
            sender_id: currentUser.id,
        });
        showToast(`Отправлено → ${name} 🎵`, 'success');
    } catch(e) {
        showToast('Ошибка отправки', 'error');
        console.error('sendTrack:', e);
    }
}

async function renameTrack(id) {
    const track = MP.tracks.find(t => t.id === id);
    if (!track) return;
    const ov = document.createElement('div');
    ov.className = 'modal-overlay';
    ov.onclick = e => { if (e.target===ov) ov.remove(); };
    const sh = document.createElement('div');
    sh.className = 'modal-sheet';
    sh.innerHTML = `<div class="modal-handle"></div>
        <div style="font-size:17px;font-weight:700;margin-bottom:16px">Переименовать трек</div>
        <div style="margin-bottom:10px">
            <div style="font-size:12px;color:rgba(255,255,255,.4);margin-bottom:6px">Название</div>
            <input id="_rename_title" value="${escHtml(track.title||'')}" style="width:100%;padding:13px 14px;background:rgba(255,255,255,.07);border:.5px solid rgba(255,255,255,.12);border-radius:14px;color:#fff;font-size:15px;font-family:inherit;outline:none;box-sizing:border-box">
        </div>
        <div style="margin-bottom:20px">
            <div style="font-size:12px;color:rgba(255,255,255,.4);margin-bottom:6px">Исполнитель</div>
            <input id="_rename_artist" value="${escHtml(track.artist||'')}" style="width:100%;padding:13px 14px;background:rgba(255,255,255,.07);border:.5px solid rgba(255,255,255,.12);border-radius:14px;color:#fff;font-size:15px;font-family:inherit;outline:none;box-sizing:border-box">
        </div>
        <button id="_rename_save" style="width:100%;padding:15px;background:var(--accent);border:none;border-radius:16px;color:#000;font-size:16px;font-weight:700;cursor:pointer;font-family:inherit">Сохранить</button>`;
    ov.appendChild(sh);
    document.body.appendChild(ov);
    sh.querySelector('#_rename_title').focus();
    sh.querySelector('#_rename_save').onclick = async () => {
        const newTitle  = sh.querySelector('#_rename_title').value.trim();
        const newArtist = sh.querySelector('#_rename_artist').value.trim();
        if (!newTitle) return;
        track.title  = newTitle;
        track.artist = newArtist;
        // Обновляем в IndexedDB
        await _mdbPut('tracks', track).catch(() => {});
        _mpRender();
        _mpUpdateCard();
        _mpSyncTracksToServer();
        showToast('Название сохранено', 'success');
        ov.remove();
    };
}

async function musicDeleteTrack(id) {
    vibrate(30);
    await _mdbDelete('tracks', id); await _mdbDelete('blobs', id);
    const wi = MP.tracks.findIndex(t => t.id === id);
    if (wi >= 0) MP.tracks.splice(wi, 1);
    if (wi === MP.idx) { MP.audioEl?.pause(); MP.playing=false; MP.idx=-1; _mpStopViz(); }
    else if (wi < MP.idx && MP.idx > 0) MP.idx--;
    _mpRender();
    showToast('Трек удалён', 'success');
}

// ══ Player card ══
function _mpUpdateCard() {
    const track = MP.tracks[MP.idx];
    const pc = document.getElementById('music-player-card');
    const eq = document.getElementById('music-eq-section');
    if (pc) pc.style.display = track ? '' : 'none';
    // eq-section управляется только через musicShowEQ()
    if (!track) return;

    const el = id => document.getElementById(id);
    const set = (id, v) => { const e=el(id); if(e) e.textContent=v; };
    set('mpc-title',  track.title  || '—');
    set('mpc-artist', track.artist || '—');

    const badge = el('mpc-source-badge');
    if (badge) badge.style.display = track.isFromVideo ? '' : 'none';

    const covImg = el('mpc-cover-img');
    const covBg  = el('mpc-cover-bg');
    if (covImg) { covImg.src = track.coverUrl||''; covImg.style.display = track.coverUrl ? '' : 'none'; }
    if (covBg) {
        if (track.isFromVideo) covBg.style.background = 'linear-gradient(135deg,#0f0c29,#302b63,#24243e)';
        else if (!track.coverUrl) {
            const hue = ((track.title||'')[0]||'a').charCodeAt(0)*31%360;
            covBg.style.background = `linear-gradient(135deg,hsl(${hue},40%,14%),#0a0a0e)`;
        } else covBg.style.background = 'transparent';
    }

    const ico = el('mpc-play-ico');
    if (ico) ico.innerHTML = MP.playing
        ? '<rect x="6" y="4" width="4" height="16" rx="1.5" fill="black"/><rect x="14" y="4" width="4" height="16" rx="1.5" fill="black"/>'
        : '<polygon points="6 3 20 12 6 21 6 3" fill="black"/>';

    _mpUpdateProfileCard();
}

function _mpTimeUpdate() {
    if (!MP.audioEl?.duration) return;
    const pct = (MP.audioEl.currentTime / MP.audioEl.duration) * 100;
    const bar = document.getElementById('mpc-prog-bar');
    const cur = document.getElementById('mpc-cur');
    if (bar) bar.style.width = pct + '%';
    if (cur) cur.textContent = _mpFmt(MP.audioEl.currentTime);
    // Мини-плеер прогресс
    _mpUpdateMiniProgress();
    // Карточка в профиле
    const pp = document.getElementById('mppc-prog');
    if (pp) pp.style.width = pct + '%';
    // Media Session position state
    if ('mediaSession' in navigator && 'setPositionState' in navigator.mediaSession) {
        try {
            navigator.mediaSession.setPositionState({
                duration:     MP.audioEl.duration,
                playbackRate: MP.audioEl.playbackRate,
                position:     MP.audioEl.currentTime,
            });
        } catch(e) {}
    }
}

function _mpFmt(sec) {
    if (!sec || isNaN(sec) || !isFinite(sec)) return '0:00';
    return `${Math.floor(sec/60)}:${String(Math.floor(sec%60)).padStart(2,'0')}`;
}

// ══ Визуализатор ══
function _mpStartViz() {
    const canvas = document.getElementById('music-viz-canvas');
    if (!canvas) return;
    if (MP.vizRAF) { cancelAnimationFrame(MP.vizRAF); MP.vizRAF = null; }

    if (!MP.ctx && MP.audioEl) _initWebAudio();
    if (MP.ctx && MP.ctx.state !== 'running') MP.ctx.resume().catch(() => {});

    // Подключаем analyserNode через captureStream — не нарушает фоновое воспроизведение
    if (MP.ctx && MP.analyserNode && !MP._vizConnected && MP.audioEl) {
        try {
            if (MP.audioEl.captureStream) {
                const stream = MP.audioEl.captureStream();
                const src = MP.ctx.createMediaStreamSource(stream);
                src.connect(MP.analyserNode);
                MP.analyserNode.connect(MP.ctx.destination);
                MP._vizConnected = true;
            }
        } catch(e) {}
    }

    canvas.width  = canvas.offsetWidth  * (devicePixelRatio||1);
    canvas.height = canvas.offsetHeight * (devicePixelRatio||1);
    const ctx2 = canvas.getContext('2d');
    const BARS = 52;
    let data = MP.analyserNode ? new Uint8Array(MP.analyserNode.frequencyBinCount) : null;

    const draw = () => {
        if (!MP.playing) return;
        MP.vizRAF = requestAnimationFrame(draw);
        ctx2.clearRect(0, 0, canvas.width, canvas.height);
        const W = canvas.width, H = canvas.height;
        const bw = Math.max(1, Math.floor(W / BARS) - 1);

        if (data && MP.analyserNode) {
            try { MP.analyserNode.getByteFrequencyData(data); } catch(e) { data = null; }
        }

        for (let i = 0; i < BARS; i++) {
            const v = data
                ? data[Math.floor(i * data.length / BARS)] / 255
                : 0.1 + Math.sin(Date.now() / 400 + i * 0.4) * 0.08;
            const h = Math.max(3, v * H * 0.88);
            ctx2.fillStyle = `hsla(${155 + v * 85},72%,52%,${0.35 + v * 0.65})`;
            ctx2.beginPath();
            if (ctx2.roundRect) ctx2.roundRect(i * (bw+1), H - h, bw, h, 3);
            else ctx2.rect(i * (bw+1), H - h, bw, h);
            ctx2.fill();
        }
    };
    draw();
}
function _mpStopViz() {
    if (MP.vizRAF) { cancelAnimationFrame(MP.vizRAF); MP.vizRAF=null; }
}

// ══ EQ presets ══
function _mpBuildEqPresets() {
    const row = document.getElementById('eq-presets-row');
    if (!row || row.children.length) return;
    Object.keys(EQ_PRESETS).forEach(name => {
        const btn = document.createElement('button');
        btn.className = 'eq-preset-btn';
        btn.textContent = name;
        btn.style.cssText = 'padding:6px 14px;border-radius:20px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;-webkit-tap-highlight-color:transparent;white-space:nowrap;transition:all .15s';
        _mpEqPresetStyle(btn, false);
        btn.addEventListener('click', () => {
            musicApplyPreset(name);
            document.querySelectorAll('.eq-preset-btn').forEach(b => _mpEqPresetStyle(b, false));
            _mpEqPresetStyle(btn, true);
        });
        row.appendChild(btn);
    });
}
function _mpEqPresetStyle(btn, active) {
    btn.style.background  = active ? 'rgba(167,139,250,.22)' : 'rgba(255,255,255,.07)';
    btn.style.color       = active ? '#c4b5fd' : 'rgba(255,255,255,.55)';
    btn.style.border      = active ? '.5px solid rgba(167,139,250,.4)' : '.5px solid rgba(255,255,255,.1)';
}

function musicApplyPreset(name) {
    const gains = EQ_PRESETS[name]; if (!gains) return;
    if (!MP.ctx && MP.audioEl) _initWebAudio();
    if (!MP.eqEnabled) { MP.eqEnabled = true; _mpEqToggleUI(true); _mpRoutingUpdate(); }
    MP.eqGains = [...gains];
    _mpApplyEqToFilters();
    if (MP.playing) (void 0);
    _mpDrawEq();
    showToast(`EQ: ${name}`, 'info');
}
function musicShowEQ() {
    const sec = document.getElementById('music-eq-section');
    const btn = document.getElementById('mpc-eq-btn');
    if (!sec) return;
    const visible = sec.style.display !== 'none';
    if (visible) {
        sec.style.display = 'none';
        if (btn) { btn.style.color = 'rgba(255,255,255,.4)'; btn.style.background = 'rgba(255,255,255,.06)'; btn.style.borderColor = 'rgba(255,255,255,.1)'; }
    } else {
        sec.style.display = 'block';
        if (btn) { btn.style.color = 'var(--accent)'; btn.style.background = 'rgba(16,185,129,.12)'; btn.style.borderColor = 'rgba(16,185,129,.3)'; }
        _mpInitEqCanvas();
        setTimeout(() => _mpDrawEq(), 50);
    }
}
function musicToggleEQ() {
    MP.eqEnabled = !MP.eqEnabled;
    if (!MP.ctx && MP.audioEl) _initWebAudio();
    _mpApplyEqToFilters();
    _mpEqToggleUI(MP.eqEnabled);
    _mpDrawEq();
    showToast(MP.eqEnabled ? 'Эквалайзер включён' : 'Эквалайзер выключен', 'info');
}
function musicDisableEQ() {
    MP.eqEnabled = false;
    _mpApplyEqToFilters();
    _mpEqToggleUI(false);
    _mpDrawEq();
}
function musicResetEQ() {
    MP.eqGains = [0,0,0,0,0,0,0,0,0,0];
    if (MP.eqEnabled) _mpApplyEqToFilters();
    _mpDrawEq();
    document.querySelectorAll('.eq-preset-btn').forEach(b => _mpEqPresetStyle(b, false));
    showToast('EQ сброшен', 'info');
}
function _mpEqToggleUI(on) {
    const sw=document.getElementById('eq-toggle-switch');
    const th=document.getElementById('eq-toggle-thumb');
    const lb=document.getElementById('eq-toggle-label');
    if (sw) sw.style.background = on ? '#7c3aed' : 'rgba(255,255,255,.1)';
    if (th) th.style.transform  = on ? 'translateX(18px)' : '';
    if (lb) { lb.textContent = on ? 'ВКЛ' : 'ВЫКЛ'; lb.style.color = on ? '#c4b5fd' : 'rgba(255,255,255,.3)'; }
    _mpDrawEq();
}

// ══ Карточка "сейчас играет" в профиле ══
function _mpUpdateProfileCard() {
    const track = MP.tracks[MP.idx];
    const card  = document.getElementById('mp-profile-card');
    if (!card) return;
    if (!track) { card.style.display = 'none'; return; }
    card.style.display = '';

    const title  = card.querySelector('#mppc-title');
    const artist = card.querySelector('#mppc-artist');
    const icon   = card.querySelector('#mppc-play-ico');
    const prog   = card.querySelector('#mppc-prog');

    if (title)  title.textContent  = track.title  || '—';
    if (artist) artist.textContent = track.artist || '—';
    if (icon)   icon.innerHTML     = MP.playing
        ? '<rect x="5" y="4" width="3" height="14" rx="1" fill="currentColor"/><rect x="12" y="4" width="3" height="14" rx="1" fill="currentColor"/>'
        : '<polygon points="4 3 18 11 4 19 4 3" fill="currentColor"/>';
    if (prog && MP.audioEl?.duration) {
        prog.style.width = (MP.audioEl.currentTime / MP.audioEl.duration * 100) + '%';
    }
}

// ══ Мини-плеер — глобальный ══
let _mmpHidden = false; // пользователь закрыл крестиком — не показываем пока трек не сменится

function _mpUpdateMiniPlayer() {
    const mmp = document.getElementById('music-mini-player');
    if (!mmp) return;

    const track = MP.tracks[MP.idx];
    if (!track || _mmpHidden) {
        // Скрываем с анимацией
        mmp.style.transform = 'translateY(120%)';
        setTimeout(() => { mmp.style.display = 'none'; }, 420);
        return;
    }

    // Показываем
    if (mmp.style.display === 'none') {
        mmp.style.display = '';
        requestAnimationFrame(() => requestAnimationFrame(() => {
            mmp.style.transform = 'translateY(0)';
        }));
    }

    // Обложка
    const covEl = document.getElementById('mmp-cover');
    if (covEl) {
        if (track.coverUrl) {
            covEl.innerHTML = `<img src="${track.coverUrl}" style="width:100%;height:100%;object-fit:cover">`;
        } else {
            const hue = ((track.title||'?').charCodeAt(0)*41)%360;
            covEl.style.background = `linear-gradient(135deg,hsl(${hue},60%,22%),hsl(${hue+40},60%,18%))`;
            covEl.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M9 18V5l12-2v13" stroke="hsl(${hue},70%,70%)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                <circle cx="6" cy="18" r="3" stroke="hsl(${hue},70%,70%)" stroke-width="1.8"/>
                <circle cx="18" cy="16" r="3" stroke="hsl(${hue},70%,70%)" stroke-width="1.8"/>
            </svg>`;
        }
    }

    const titleEl  = document.getElementById('mmp-title');
    const artistEl = document.getElementById('mmp-artist');
    const icoEl    = document.getElementById('mmp-play-ico');
    if (titleEl)  titleEl.textContent  = track.title  || '—';
    if (artistEl) artistEl.textContent = track.artist || '';
    if (icoEl) icoEl.innerHTML = MP.playing
        ? '<rect x="4" y="3" width="5" height="18" rx="1.5" fill="black"/><rect x="15" y="3" width="5" height="18" rx="1.5" fill="black"/>'
        : '<polygon points="5 3 19 12 5 21 5 3" fill="black"/>';
}

function _mpUpdateMiniProgress() {
    if (!MP.audioEl?.duration) return;
    const prog = document.getElementById('mmp-prog');
    if (prog) prog.style.width = (MP.audioEl.currentTime / MP.audioEl.duration * 100) + '%';
}

function _mpCloseMiniPlayer() {
    _mmpHidden = true;
    const mmp = document.getElementById('music-mini-player');
    if (mmp) {
        mmp.style.transform = 'translateY(120%)';
        setTimeout(() => { mmp.style.display = 'none'; }, 420);
    }
    // Останавливаем музыку
    if (MP.playing) {
        MP.audioEl?.pause();
        MP.playing = false;
        _mpStopViz();
        _mpUpdateCard();
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
    }
}

// ══ Кнопка музыки в профиле + мини-карточка ══
function _injectMusicButton() {
    if (document.getElementById('music-open-btn')) return;
    const headers = [...document.querySelectorAll('#settings-section p')];
    const contactsP = headers.find(p => p.textContent.trim() === 'Контакты');
    const insertTarget = contactsP ? contactsP.closest('div[style*="margin-bottom"]') : null;
    if (!insertTarget) return;

    const wrap = document.createElement('div');
    wrap.id = 'music-open-btn';
    wrap.style.cssText = 'margin-bottom:8px';
    wrap.innerHTML = `
        <!-- Кнопка открытия плеера -->
        <div onclick="openMusicPlayer()" style="display:flex;align-items:center;gap:13px;padding:14px 16px;background:linear-gradient(135deg,rgba(124,58,237,.12),rgba(99,102,241,.07));border:.5px solid rgba(124,58,237,.2);border-radius:18px;cursor:pointer;-webkit-tap-highlight-color:transparent;margin-bottom:6px">
            <div style="width:42px;height:42px;border-radius:13px;background:rgba(124,58,237,.18);display:flex;align-items:center;justify-content:center;flex-shrink:0">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M9 18V5l12-2v13" stroke="#a78bfa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="6" cy="18" r="3" stroke="#a78bfa" stroke-width="2"/><circle cx="18" cy="16" r="3" stroke="#a78bfa" stroke-width="2"/></svg>
            </div>
            <div style="flex:1">
                <div style="font-size:15px;font-weight:600">Музыка</div>
                <div id="music-btn-subtitle" style="font-size:12px;color:rgba(255,255,255,.38);margin-top:2px">Открыть плеер</div>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style="opacity:.28;flex-shrink:0"><path d="M9 18l6-6-6-6" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
        <!-- Мини-карточка "сейчас играет" -->
        <div id="mp-profile-card" style="display:none;background:rgba(124,58,237,.1);border:.5px solid rgba(124,58,237,.2);border-radius:16px;padding:12px 14px;overflow:hidden;position:relative">
            <div style="font-size:10px;font-weight:700;letter-spacing:.6px;color:rgba(167,139,250,.7);margin-bottom:8px">СЕЙЧАС ИГРАЕТ</div>
            <div style="display:flex;align-items:center;gap:10px">
                <div style="flex:1;min-width:0">
                    <div id="mppc-title" style="font-size:14px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#e9d5ff"></div>
                    <div id="mppc-artist" style="font-size:12px;color:rgba(167,139,250,.6);margin-top:2px"></div>
                </div>
                <button onclick="musicTogglePlay()" style="width:36px;height:36px;border-radius:50%;background:rgba(124,58,237,.3);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#c4b5fd;flex-shrink:0;-webkit-tap-highlight-color:transparent">
                    <svg id="mppc-play-ico" width="15" height="15" viewBox="0 0 24 24" fill="none"><polygon points="4 3 18 11 4 19 4 3" fill="currentColor"/></svg>
                </button>
            </div>
            <!-- Прогресс -->
            <div style="margin-top:10px;height:2px;background:rgba(167,139,250,.15);border-radius:1px;overflow:hidden">
                <div id="mppc-prog" style="height:100%;background:#a78bfa;border-radius:1px;width:0%;transition:width .5s linear"></div>
            </div>
        </div>`;
    insertTarget.parentNode.insertBefore(wrap, insertTarget);
    _mpUpdateProfileCard();
}

function openMusicPlayer() {
    const sec = document.getElementById('music-section');
    if (!sec) return;
    // FIXED: z-index выше chat-view и профиля
    sec.style.zIndex    = '9200';
    sec.style.transform = 'translateY(100%)';
    sec.style.display   = '';
    sec.style.transition = 'none';
    requestAnimationFrame(() => requestAnimationFrame(() => {
        sec.style.transition = 'transform .35s cubic-bezier(.32,.72,0,1)';
        sec.style.transform  = 'translateY(0)';
    }));
    musicTabOpened();
}
function closeMusicPlayer() {
    const sec = document.getElementById('music-section');
    if (!sec) return;
    sec.style.transition = 'transform .3s cubic-bezier(.32,.72,0,1)';
    sec.style.transform  = 'translateY(100%)';
    setTimeout(() => { sec.style.display='none'; }, 320);
    _mpStopViz();
}


// ══ WAYCHAT GLOBAL API — exposed for SW messages ══════════════════
// FIX Task 4b/4c/4d: SW can call these from any scenario (A, B, C)

// ══ RESTORED FUNCTIONS FROM ORIGINAL ══
function _cl_video_poster(videoUrl) {
    try {
        // https://res.cloudinary.com/{cloud}/video/upload/.../{id}.mp4
        // → https://res.cloudinary.com/{cloud}/video/upload/so_0/{id}.jpg
        const url = videoUrl.replace('/video/upload/', '/video/upload/so_0,q_50,w_400,c_limit/');
        return url.replace(/\.(mp4|mov|webm|avi)(\?.*)?$/i, '.jpg');
    } catch(e) { return ''; }
}

function _closeDlSheet(ov, sh) {
    sh.style.animation = 'mvSlideUp 0.22s cubic-bezier(0.22,1,0.36,1) reverse forwards';
    ov.style.animation  = 'mvFadeIn 0.2s ease reverse forwards';
    setTimeout(() => ov.remove(), 220);
}

function _closeMvSheet(ov, sh) {
    sh.style.animation = 'mvSlideUp 0.22s cubic-bezier(0.22,1,0.36,1) reverse forwards';
    ov.style.animation = 'mvFadeIn 0.2s ease reverse forwards';
    setTimeout(() => ov.remove(), 220);
}

async function _confirmDeleteMoment(momentId, momentOv) {
    // Анимации (общие с mv)
    if (!document.getElementById('mv-keyframes')) {
        const st = document.createElement('style');
        st.id = 'mv-keyframes';
        st.textContent = '@keyframes mvFadeIn{from{opacity:0}to{opacity:1}}@keyframes mvSlideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}';
        document.head.appendChild(st);
    }

    // Оверлей — z-index выше момента
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:flex-end;animation:mvFadeIn 0.2s ease';

    // Подложка
    const backdrop = document.createElement('div');
    backdrop.style.cssText = 'position:absolute;inset:0;background:rgba(0,0,0,0.55);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)';
    backdrop.onclick = () => _closeDlSheet(ov, sh);
    ov.appendChild(backdrop);

    // Шторка
    const sh = document.createElement('div');
    sh.style.cssText = 'position:relative;width:100%;background:rgba(16,16,22,0.97);backdrop-filter:blur(50px) saturate(200%);-webkit-backdrop-filter:blur(50px) saturate(200%);border-radius:28px 28px 0 0;border-top:0.5px solid rgba(255,255,255,0.1);padding:0 20px 32px;animation:mvSlideUp 0.3s cubic-bezier(0.22,1,0.36,1)';

    // Хэндл
    const handle = document.createElement('div');
    handle.style.cssText = 'width:36px;height:4px;background:rgba(255,255,255,0.18);border-radius:2px;margin:12px auto 20px';

    // Иконка ведра
    const iconWrap = document.createElement('div');
    iconWrap.style.cssText = 'width:64px;height:64px;border-radius:22px;background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.2);display:flex;align-items:center;justify-content:center;margin:0 auto 18px';
    iconWrap.innerHTML = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none"><polyline points="3 6 5 6 21 6" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 11v6M14 11v6" stroke="#ef4444" stroke-width="1.8" stroke-linecap="round"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    // Текст
    const title = document.createElement('div');
    title.style.cssText = 'font-size:19px;font-weight:700;letter-spacing:-0.4px;text-align:center;margin-bottom:8px';
    title.textContent = 'Удалить момент?';

    const sub = document.createElement('div');
    sub.style.cssText = 'font-size:14px;color:rgba(255,255,255,0.45);text-align:center;margin-bottom:28px;line-height:1.4';
    sub.textContent = 'Момент исчезнет у всех пользователей. Это действие нельзя отменить.';

    // Кнопка удалить
    const delBtn = document.createElement('button');
    delBtn.style.cssText = 'width:100%;padding:16px;background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.28);border-radius:18px;color:#ef4444;font-size:16px;font-weight:700;cursor:pointer;font-family:inherit;letter-spacing:-0.2px;transition:background 0.15s,transform 0.1s;margin-bottom:10px';
    delBtn.textContent = 'Удалить';
    delBtn.onpointerdown = () => { delBtn.style.transform='scale(0.97)'; delBtn.style.background='rgba(239,68,68,0.28)'; };
    delBtn.onpointerup   = () => { delBtn.style.transform=''; delBtn.style.background='rgba(239,68,68,0.15)'; };
    delBtn.onpointercancel = () => { delBtn.style.transform=''; delBtn.style.background='rgba(239,68,68,0.15)'; };
    delBtn.onclick = async () => {
        _closeDlSheet(ov, sh);
        if (momentOv) momentOv.remove();
        await apiFetch('/delete_moment/' + momentId, {method: 'POST'});
        momentsCache = null;
        loadMoments();
        showToast('Момент удалён', 'success');
    };

    // Кнопка отмена
    const cancelBtn = document.createElement('button');
    cancelBtn.style.cssText = 'width:100%;padding:16px;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.1);border-radius:18px;color:#fff;font-size:16px;font-weight:600;cursor:pointer;font-family:inherit;letter-spacing:-0.2px;transition:background 0.15s,transform 0.1s';
    cancelBtn.textContent = 'Отмена';
    cancelBtn.onpointerdown = () => { cancelBtn.style.background='rgba(255,255,255,0.13)'; };
    cancelBtn.onpointerup   = () => { cancelBtn.style.background='rgba(255,255,255,0.07)'; };
    cancelBtn.onpointercancel = () => { cancelBtn.style.background='rgba(255,255,255,0.07)'; };
    cancelBtn.onclick = () => _closeDlSheet(ov, sh);

    // Свайп вниз — закрыть
    let _sy = 0, _ty = 0;
    sh.addEventListener('touchstart', e => { _sy = e.touches[0].clientY; _ty = 0; }, {passive:true});
    sh.addEventListener('touchmove',  e => {
        _ty = e.touches[0].clientY - _sy;
        if (_ty > 0) sh.style.transform = 'translateY(' + _ty + 'px)';
    }, {passive:true});
    sh.addEventListener('touchend', () => {
        if (_ty > 80) _closeDlSheet(ov, sh);
        else { sh.style.transition = 'transform 0.2s'; sh.style.transform = ''; setTimeout(() => sh.style.transition = '', 200); }
    }, {passive:true});

    sh.appendChild(handle);
    sh.appendChild(iconWrap);
    sh.appendChild(title);
    sh.appendChild(sub);
    sh.appendChild(delBtn);
    sh.appendChild(cancelBtn);
    ov.appendChild(sh);
    document.body.appendChild(ov);
}

function _createGCTile(userId, userName, userAvatar, isMe = false) {
    _injectGroupCallCSS();
    const tile = document.createElement('div');
    tile.className = 'gc-tile';
    tile.id = `gc-tile-${userId}`;

    // Аватар (показывается пока нет видео)
    const avaWrap = document.createElement('div');
    avaWrap.className = 'gc-ava-wrap';
    if (userAvatar && !userAvatar.includes('default') && !userAvatar.startsWith('emoji:')) {
        const img = document.createElement('img');
        img.src = userAvatar;
        img.style.cssText = 'width:100%;height:100%;object-fit:cover';
        avaWrap.appendChild(img);
    } else {
        avaWrap.textContent = (userName || '?')[0].toUpperCase();
    }
    tile.appendChild(avaWrap);

    // Видео-элемент
    const vid = document.createElement('video');
    vid.autoplay = true; vid.playsInline = true;
    if (isMe) vid.muted = true;
    vid.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:none';
    tile.appendChild(vid);

    // Оверлей снизу
    const ov = document.createElement('div');
    ov.className = 'gc-tile-overlay';
    ov.innerHTML = `
        <span class="gc-name">${isMe ? 'Вы' : (userName || 'Участник')}</span>
        <span class="gc-mic-icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <line x1="1" y1="1" x2="23" y2="23" stroke="rgba(255,100,100,0.9)" stroke-width="2.5" stroke-linecap="round"/>
                <path d="M9 9v3a3 3 0 005.12 2.12M15 9.34V4a3 3 0 00-5.94-.6" stroke="rgba(255,100,100,0.9)" stroke-width="2" stroke-linecap="round"/>
            </svg>
        </span>
    `;
    tile.appendChild(ov);

    return tile;
}

function _getPerms() {
    try { return JSON.parse(localStorage.getItem(_PERM_KEY) || '{}'); } catch(e){ return {}; }
}

function _injectGroupCallCSS() {
    if (document.getElementById('gc-style')) return;
    const st = document.createElement('style');
    st.id = 'gc-style';
    st.textContent = `
        #group-call-grid {
            position: absolute;
            inset: 0;
            padding: max(env(safe-area-inset-top),52px) 10px 190px;
            display: none;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
            overflow-y: auto;
            align-content: start;
            z-index: 10;
        }
        #group-call-grid.active { display: grid; }
        #group-call-grid.single { grid-template-columns: 1fr; }
        .gc-tile {
            position: relative;
            border-radius: 22px;
            overflow: hidden;
            background: linear-gradient(145deg, #1a1a2e, #16213e);
            border: 1.5px solid rgba(255,255,255,0.08);
            aspect-ratio: 3/4;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            transition: border-color 0.3s, box-shadow 0.3s;
            animation: gcTileIn 0.35s cubic-bezier(.34,1.56,.64,1);
        }
        .gc-tile.speaking {
            border-color: var(--accent, #10b981);
            box-shadow: 0 0 0 2px var(--accent, #10b981), 0 8px 30px rgba(16,185,129,0.3);
        }
        .gc-tile.muted .gc-mic-icon { opacity: 1; }
        @keyframes gcTileIn {
            from { opacity: 0; transform: scale(0.85); }
            to   { opacity: 1; transform: scale(1); }
        }
        .gc-tile video {
            position: absolute; inset: 0;
            width: 100%; height: 100%;
            object-fit: cover;
        }
        .gc-tile-overlay {
            position: absolute; bottom: 0; left: 0; right: 0;
            background: linear-gradient(transparent, rgba(0,0,0,0.7));
            padding: 12px 10px 12px;
            display: flex; align-items: center; justify-content: space-between;
        }
        .gc-name {
            font-size: 13px; font-weight: 700; color: #fff;
            text-shadow: 0 1px 4px rgba(0,0,0,0.5);
            overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .gc-mic-icon { opacity: 0; transition: opacity 0.2s; }
        .gc-ava-wrap {
            width: 64px; height: 64px; border-radius: 50%;
            overflow: hidden; margin-bottom: 10px;
            border: 3px solid rgba(255,255,255,0.2);
            background: var(--accent,#10b981);
            display: flex; align-items: center; justify-content: center;
            font-size: 26px; font-weight: 800; color: #000;
            flex-shrink: 0;
        }
    `;
    document.head.appendChild(st);
}

function _pluralViews(n) {
    if (n % 10 === 1 && n % 100 !== 11) return 'просмотр';
    if ([2,3,4].includes(n % 10) && ![12,13,14].includes(n % 100)) return 'просмотра';
    return 'просмотров';
}

function _renderViewersList(container, viewers) {
    if (!viewers || !viewers.length) {
        container.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;gap:10px;padding:44px 0 20px;opacity:0.3">'
            + '<svg width="38" height="38" viewBox="0 0 24 24" fill="none"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="12" r="3" stroke="white" stroke-width="1.5"/></svg>'
            + '<div style="font-size:15px;font-weight:500">Ещё никто не смотрел</div>'
            + '</div>';
        return;
    }
    container.innerHTML = viewers.map((v, i) => {
        const isLast = i === viewers.length - 1;
        return '<div style="display:flex;align-items:center;gap:14px;padding:12px 0;' + (isLast ? '' : 'border-bottom:0.5px solid rgba(255,255,255,0.07)') + '">'
            + getAvatarHtml({id:v.id, name:v.name, avatar:v.avatar}, 'w-11 h-11')
            + '<div style="flex:1;min-width:0">'
            + '<div style="font-weight:600;font-size:15px;letter-spacing:-0.2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + escHtml(v.name) + '</div>'
            + '<div style="font-size:12px;color:rgba(255,255,255,0.42);margin-top:2px;display:flex;align-items:center;gap:4px">'
            + '<svg width="11" height="11" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/><polyline points="12 6 12 12 16 14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
            + (v.time || '') + '</div>'
            + '</div>'
            + '</div>';
    }).join('');
}

function _runMomentsViewer(list, startIdx) {
    // Пауза музыки на время просмотра момента
    const _wasMusicPlaying = MP.playing;
    if (MP.playing && MP.audioEl) {
        MP.audioEl.pause();
        MP.playing = false;
        _mpStopViz();
        _mpUpdateCard();
        _mpUpdateMiniPlayer();
    }

    let idx = startIdx;
    let autoTimer = null;
    let mediaLoaded = false;

    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;z-index:9000;background:#000;touch-action:none;font-family:-apple-system,BlinkMacSystemFont,SF Pro Display,sans-serif';

    function render() {
        ov.innerHTML = '';
        mediaLoaded = false;
        clearTimeout(autoTimer);
        const m = list[idx];
        const isMe = m.user_id === currentUser?.id;

        // ── Фон ──
        const bg = document.createElement('div');
        bg.style.cssText = 'position:absolute;inset:0;background:#000';

        if (m.media_url) {
            const isVideo = /\.(mp4|mov|webm)/i.test(m.media_url);

            // Размытый фон — показывается мгновенно
            const blurBg = document.createElement('div');
            blurBg.id = 'mb-blur';
            // Для видео — используем постер как блюр-фон (грузится намного быстрее чем видео)
            const blurSrc = (isVideo && m.media_url.includes('res.cloudinary.com'))
                ? _cl_video_poster(m.media_url)
                : m.media_url;
            blurBg.style.cssText = 'position:absolute;inset:-30px;background-image:url('+JSON.stringify(blurSrc)+');background-size:cover;background-position:center;filter:blur(24px) brightness(0.35);transition:opacity 0.4s ease';
            bg.appendChild(blurBg);

            // Спиннер
            const spin = document.createElement('div');
            spin.id = 'mb-spin';
            spin.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;z-index:3;transition:opacity 0.2s';
            spin.innerHTML = '<div style="width:40px;height:40px;border:2.5px solid rgba(255,255,255,0.1);border-top-color:rgba(255,255,255,0.85);border-radius:50%;animation:spin 0.65s linear infinite"></div>';
            bg.appendChild(spin);

            function onReady() {
                if (mediaLoaded) return;
                mediaLoaded = true;
                const media = bg.querySelector('video,img');
                if (media) {
                    media.style.visibility = 'visible';
                    media.style.opacity = '1';
                }
                blurBg.style.opacity = '0';
                spin.style.display = 'none';
                const dur = isVideo
                    ? Math.min((bg.querySelector('video')?.duration||7)*1000, 30000)
                    : 6000;
                const fill = document.getElementById('mpf');
                if (fill) { fill.style.transition='width '+(dur/1000)+'s linear'; fill.style.width='100%'; }
                autoTimer = setTimeout(() => next(), dur + 200);
                // Предзагружаем следующее медиа
                if (list[idx+1]?.media_url) _preloadMedia(list[idx+1].media_url);
            }

            if (isVideo) {
                const vid = document.createElement('video');
                vid.autoplay = true; vid.loop = false; vid.playsInline = true; vid.muted = false;
                vid.preload = 'auto'; // полная загрузка для плавного воспроизведения
                // opacity:0 + visibility:hidden предотвращает мелькание первого кадра
                vid.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity 0.35s;visibility:hidden';
                // poster = превью от Cloudinary (первый кадр как изображение) — убирает чёрный экран
                if (m.media_url && m.media_url.includes('res.cloudinary.com')) {
                    vid.poster = _cl_video_poster(m.media_url);
                }
                vid.oncanplaythrough = onReady;
                vid.oncanplay = onReady;  // fallback
                vid.onended = () => next();
                vid.onerror = () => onReady();
                // Таймаут 3с — быстрый показ постера и продолжение
                const vidTimeout = setTimeout(() => onReady(), 3000);
                const _origOnReady = onReady;
                vid._clearTimeout = () => clearTimeout(vidTimeout);
                const _patchedOnReady = function() { clearTimeout(vidTimeout); _origOnReady(); };
                vid.oncanplaythrough = _patchedOnReady;
                vid.oncanplay = _patchedOnReady;
                vid.onended = () => next();
                if (_mediaCache.has(m.media_url)) {
                    vid.src = _mediaCache.get(m.media_url);
                    // Уже в кеше — можем показать почти мгновенно
                    vid.onloadeddata = () => { clearTimeout(vidTimeout); onReady(); };
                } else {
                    vid.src = m.media_url;
                    _getCachedMedia(m.media_url).catch(() => {});
                }
                bg.appendChild(vid);
            } else {
                const img = document.createElement('img');
                img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity 0.3s';
                img.onload = onReady;
                img.onerror = onReady;
                img.src = _mediaCache.get(m.media_url) || m.media_url;
                bg.appendChild(img);
            }

            // Текст поверх медиа
            if (m.text) {
                const textLayer = document.createElement('div');
                textLayer.style.cssText = 'position:absolute;bottom:140px;left:0;right:0;z-index:5;display:flex;justify-content:center;padding:0 20px;pointer-events:none';
                textLayer.innerHTML = '<div style="background:rgba(0,0,0,0.6);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border-radius:18px;padding:10px 18px;font-size:clamp(14px,4vw,20px);font-weight:700;color:#fff;text-align:center;line-height:1.4;max-width:100%">' + escHtml(m.text) + '</div>';
                bg.appendChild(textLayer);
            }

        } else {
            // Только текст
            bg.style.background = 'linear-gradient(135deg,#1a1a2e,#16213e,#0f3460)';
            const txt = document.createElement('div');
            txt.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:40px;z-index:2';
            txt.innerHTML = '<div style="font-size:clamp(18px,5vw,28px);font-weight:700;color:#fff;text-align:center;line-height:1.5;text-shadow:0 2px 16px rgba(0,0,0,0.5)">' + escHtml(m.text||'') + '</div>';
            bg.appendChild(txt);
            // Для текстовых — стартуем прогресс сразу
            setTimeout(() => {
                const fill = document.getElementById('mpf');
                if (fill) { fill.style.transition='width 5s linear'; fill.style.width='100%'; }
                autoTimer = setTimeout(() => next(), 5200);
            }, 50);
        }
        ov.appendChild(bg);

        // Трекинг просмотра
        if (m.user_id !== currentUser?.id) {
            apiFetch('/view_moment/' + m.id, {method:'POST'}).catch(()=>{});
        }

        // ── Прогресс-бары сверху ──
        const bars = document.createElement('div');
        bars.style.cssText = 'position:absolute;top:max(env(safe-area-inset-top,12px),12px);left:12px;right:12px;z-index:10;display:flex;gap:3px';
        list.forEach((_,i) => {
            const bar = document.createElement('div');
            bar.style.cssText = 'flex:1;height:2.5px;background:rgba(255,255,255,0.25);border-radius:2px;overflow:hidden';
            const fill = document.createElement('div');
            fill.style.cssText = 'height:100%;background:white;border-radius:2px;width:'+(i<idx?'100':'0')+'%';
            if (i===idx) fill.id = 'mpf';
            bar.appendChild(fill); bars.appendChild(bar);
        });
        ov.appendChild(bars);

        // ── Кнопка закрыть ──
        const xBtn = document.createElement('button');
        xBtn.style.cssText = 'position:absolute;top:max(calc(env(safe-area-inset-top,0px)+20px),28px);right:14px;z-index:11;background:rgba(0,0,0,0.45);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);border:none;color:white;width:36px;height:36px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0';
        xBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1 1l10 10M11 1L1 11" stroke="white" stroke-width="2" stroke-linecap="round"/></svg>';
        xBtn.onclick = e => { e.stopPropagation(); clearTimeout(autoTimer); ov.remove(); };
        ov.appendChild(xBtn);

        // ── Инфо снизу ──
        const btmGrad = document.createElement('div');
        btmGrad.style.cssText = 'position:absolute;bottom:0;left:0;right:0;height:200px;background:linear-gradient(to top,rgba(0,0,0,0.8) 0%,transparent 100%);z-index:4;pointer-events:none';
        ov.appendChild(btmGrad);

        const btm = document.createElement('div');
        btm.style.cssText = 'position:absolute;bottom:0;left:0;right:0;z-index:5;padding:16px 16px max(16px,28px);display:flex;align-items:flex-end;gap:12px';
        btm.innerHTML = getAvatarHtml({id:m.user_id,name:m.user_name,avatar:m.user_avatar},'w-11 h-11');
        const it = document.createElement('div');
        it.style.cssText = 'flex:1;min-width:0';
        it.innerHTML = '<div style="font-weight:700;font-size:15px;color:#fff;text-shadow:0 1px 6px rgba(0,0,0,0.6)">' + escHtml(m.user_name) + '</div>'
            + '<div style="font-size:12px;color:rgba(255,255,255,0.65);margin-top:2px">' + m.timestamp + (m.geo_name ? ' · 📍' + escHtml(m.geo_name) : '') + '</div>';
        btm.appendChild(it);

        // Кнопка "Переслать" — для чужих моментов
        if (!isMe) {
            const fwdBtn = document.createElement('button');
            fwdBtn.style.cssText = 'display:flex;align-items:center;gap:7px;background:rgba(255,255,255,0.14);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,0.22);border-radius:50px;color:#fff;padding:9px 16px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;box-shadow:0 2px 14px rgba(0,0,0,0.3);flex-shrink:0';
            fwdBtn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none"><polyline points="15 17 20 12 15 7" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 12v-2a6 6 0 016-6h10" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> Переслать';
            fwdBtn.onclick = e => { e.stopPropagation(); clearTimeout(autoTimer); _forwardMoment(m); };
            btm.appendChild(fwdBtn);
        }

        if (isMe) {
            const acts = document.createElement('div');
            acts.style.cssText = 'display:flex;gap:10px;align-items:center;flex-shrink:0';
            // Глазок
            const viewBtn = document.createElement('button');
            viewBtn.style.cssText = 'display:flex;align-items:center;gap:7px;background:rgba(255,255,255,0.14);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,0.22);border-radius:50px;color:#fff;padding:9px 16px;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit;box-shadow:0 2px 14px rgba(0,0,0,0.3);transition:background 0.15s,transform 0.1s';
            viewBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="white" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="12" r="3" stroke="white" stroke-width="2.3"/></svg><span id="mv-vcnt-' + m.id + '">' + (m.view_count||0) + '</span>';
            viewBtn.onpointerdown = () => { viewBtn.style.transform='scale(0.92)'; viewBtn.style.background='rgba(255,255,255,0.24)'; };
            viewBtn.onpointerup = () => { viewBtn.style.transform=''; viewBtn.style.background='rgba(255,255,255,0.14)'; };
            viewBtn.onpointercancel = () => { viewBtn.style.transform=''; viewBtn.style.background='rgba(255,255,255,0.14)'; };
            viewBtn.onclick = e => { e.stopPropagation(); _showMomentViewers(m.id, ov); };
            // Ведро
            const del = document.createElement('button');
            del.style.cssText = 'width:42px;height:42px;display:flex;align-items:center;justify-content:center;background:rgba(239,68,68,0.18);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border:1px solid rgba(239,68,68,0.32);border-radius:50%;cursor:pointer;box-shadow:0 2px 14px rgba(239,68,68,0.2);transition:background 0.15s,transform 0.1s;flex-shrink:0';
            del.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><polyline points="3 6 5 6 21 6" stroke="#ef4444" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" stroke="#ef4444" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 11v6M14 11v6" stroke="#ef4444" stroke-width="2" stroke-linecap="round"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" stroke="#ef4444" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
            del.onpointerdown = () => { del.style.transform='scale(0.88)'; del.style.background='rgba(239,68,68,0.38)'; };
            del.onpointerup = () => { del.style.transform=''; del.style.background='rgba(239,68,68,0.18)'; };
            del.onpointercancel = () => { del.style.transform=''; del.style.background='rgba(239,68,68,0.18)'; };
            del.onclick = e => { e.stopPropagation(); clearTimeout(autoTimer); _confirmDeleteMoment(m.id, ov); };
            acts.appendChild(viewBtn); acts.appendChild(del);
            btm.appendChild(acts);
        }
        ov.appendChild(btm);

        // Тап по половинам экрана
        ov.onclick = e => {
            if (e.target.closest('button')) return;
            clearTimeout(autoTimer);
            if (e.clientX < window.innerWidth/2) prev(); else next();
        };

        // Свайп (горизонтальный — след/пред момент, вертикальный — закрыть)
        let _tsX = 0, _tsY = 0, _swipeDx = 0;
        ov.addEventListener('touchstart', e => {
            _tsX = e.touches[0].clientX;
            _tsY = e.touches[0].clientY;
            _swipeDx = 0;
        }, {passive:true});
        ov.addEventListener('touchmove', e => {
            _swipeDx = e.touches[0].clientX - _tsX;
            const dy = e.touches[0].clientY - _tsY;
            // Анимируем слайд
            if (Math.abs(_swipeDx) > Math.abs(dy) && Math.abs(_swipeDx) > 10) {
                ov.style.transform = `translateX(${_swipeDx * 0.3}px)`;
            }
        }, {passive:true});
        ov.addEventListener('touchend', e => {
            ov.style.transform = '';
            const dy = e.changedTouches[0].clientY - _tsY;
            if (Math.abs(dy) > 80 && Math.abs(dy) > Math.abs(_swipeDx)) {
                // Вертикальный свайп вниз — закрыть
                clearTimeout(autoTimer); ov.remove();
            } else if (_swipeDx < -60) {
                clearTimeout(autoTimer); next();
            } else if (_swipeDx > 60) {
                clearTimeout(autoTimer); prev();
            }
        }, {passive:true});
    }

    function next() { clearTimeout(autoTimer); if (idx<list.length-1){idx++;render();}else{ov.remove();} }
    function prev() { clearTimeout(autoTimer); if (idx>0){idx--;render();}else{ render(); } }

    document.body.appendChild(ov);
    render();

    // Следим за удалением оверлея — возобновляем музыку
    const _momentObserver = new MutationObserver(() => {
        if (!document.body.contains(ov)) {
            _momentObserver.disconnect();
            if (_wasMusicPlaying && MP.audioEl && MP.idx >= 0) {
                MP.audioEl.play()
                    .then(() => {
                        MP.playing = true;
                        _mpStartViz();
                        _mpUpdateCard();
                        _mpUpdateMiniPlayer();
                        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
                    })
                    .catch(() => {});
            }
        }
    });
    _momentObserver.observe(document.body, { childList: true });
}

function _savePerm(key, val) {
    const p = _getPerms(); p[key] = val;
    localStorage.setItem(_PERM_KEY, JSON.stringify(p));
}

function _setupSpeakingDetector(userId, stream) {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const src = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        src.connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);
        const check = () => {
            if (!GC.active || !GC.peers[userId]) { ctx.close(); return; }
            analyser.getByteFrequencyData(data);
            const avg = data.reduce((a, b) => a + b, 0) / data.length;
            const tile = document.getElementById(`gc-tile-${userId}`);
            if (tile) tile.classList.toggle('speaking', avg > 18);
            requestAnimationFrame(check);
        };
        requestAnimationFrame(check);
    } catch(e) {}
}

function _showAddParticipantBtn() {
    const row = document.getElementById('add-participant-row');
    if (row) { row.style.opacity = '1'; row.style.pointerEvents = 'auto'; }
}

function _showGCInviteBanner(data) {
    document.getElementById('gc-invite-banner')?.remove();
    const banner = document.createElement('div');
    banner.id = 'gc-invite-banner';
    banner.style.cssText = `
        position:fixed;top:max(env(safe-area-inset-top),16px);left:12px;right:12px;
        z-index:99999;
        background:rgba(15,15,20,0.92);
        backdrop-filter:blur(30px);-webkit-backdrop-filter:blur(30px);
        border:1px solid rgba(255,255,255,0.12);
        border-radius:22px;padding:14px 16px;
        display:flex;align-items:center;gap:12px;
        box-shadow:0 8px 40px rgba(0,0,0,0.6);
        animation:slideDown 0.4s cubic-bezier(.34,1.56,.64,1);
    `;

    const typeLabel = data.call_type === 'video' ? 'Видеозвонок' : 'Голосовой';
    banner.innerHTML = `
        <div style="width:44px;height:44px;border-radius:50%;background:var(--accent,#10b981);display:flex;align-items:center;justify-content:center;flex-shrink:0;animation:pulse 1.5s infinite">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" stroke="black" stroke-width="2.5" stroke-linecap="round"/><circle cx="9" cy="7" r="4" stroke="black" stroke-width="2.5"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" stroke="black" stroke-width="2" stroke-linecap="round"/></svg>
        </div>
        <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:800">${escHtml(data.from_name||'Пользователь')}</div>
            <div style="font-size:12px;color:rgba(255,255,255,0.5);margin-top:1px">${typeLabel} · Групповой звонок</div>
        </div>
        <div style="display:flex;gap:8px">
            <button id="gc-inv-decline" style="width:38px;height:38px;border-radius:50%;background:rgba(239,68,68,0.25);border:1.5px solid rgba(239,68,68,0.4);color:#f87171;cursor:pointer;display:flex;align-items:center;justify-content:center">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/><line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>
            </button>
            <button id="gc-inv-accept" style="width:38px;height:38px;border-radius:50%;background:rgba(16,185,129,0.25);border:1.5px solid rgba(16,185,129,0.4);color:var(--accent,#10b981);cursor:pointer;display:flex;align-items:center;justify-content:center">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12 12 0 00.67 2.68 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12 12 0 002.68.67A2 2 0 0122 16.92z" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
            </button>
        </div>
    `;

    document.body.appendChild(banner);

    const close = () => {
        banner.style.animation = 'slideUp 0.3s ease forwards';
        setTimeout(() => banner.remove(), 300);
    };

    banner.querySelector('#gc-inv-decline').onclick = () => close();
    banner.querySelector('#gc-inv-accept').onclick  = () => {
        close();
        startGroupCall(data.call_type, data.room);
    };

    // Авто-закрытие через 25 сек
    setTimeout(close, 25000);

    if (!document.getElementById('gc-banner-style')) {
        const st = document.createElement('style'); st.id='gc-banner-style';
        st.textContent = `
            @keyframes slideDown{from{opacity:0;transform:translateY(-120%)}to{opacity:1;transform:translateY(0)}}
            @keyframes slideUp{from{opacity:1;transform:translateY(0)}to{opacity:0;transform:translateY(-120%)}}
            @keyframes gcTileOut{to{opacity:0;transform:scale(0.8)}}
        `;
        document.head.appendChild(st);
    }
}

async function _showMomentViewers(momentId, momentOv) {
    if (!document.getElementById('mv-keyframes')) {
        const st = document.createElement('style');
        st.id = 'mv-keyframes';
        st.textContent = '@keyframes mvFadeIn{from{opacity:0}to{opacity:1}}@keyframes mvSlideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}';
        document.head.appendChild(st);
    }
    document.getElementById('mv-ov-' + momentId)?.remove();
    const cached = _viewersCache[momentId];

    const ov = document.createElement('div');
    ov.id = 'mv-ov-' + momentId;
    ov.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:flex-end;animation:mvFadeIn 0.2s ease';

    const backdrop = document.createElement('div');
    backdrop.style.cssText = 'position:absolute;inset:0;background:rgba(0,0,0,0.55);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)';
    backdrop.onclick = () => _closeMvSheet(ov, sh);
    ov.appendChild(backdrop);

    const sh = document.createElement('div');
    sh.style.cssText = 'position:relative;width:100%;background:rgba(16,16,22,0.97);backdrop-filter:blur(50px) saturate(200%);-webkit-backdrop-filter:blur(50px) saturate(200%);border-radius:28px 28px 0 0;border-top:0.5px solid rgba(255,255,255,0.1);padding:0 0 28px;animation:mvSlideUp 0.3s cubic-bezier(0.22,1,0.36,1);max-height:70vh;display:flex;flex-direction:column';

    const handle = document.createElement('div');
    handle.style.cssText = 'width:36px;height:4px;background:rgba(255,255,255,0.18);border-radius:2px;margin:12px auto 0;flex-shrink:0';

    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:16px 20px 12px;flex-shrink:0';

    const titleWrap = document.createElement('div');
    titleWrap.style.cssText = 'display:flex;align-items:center;gap:10px';
    titleWrap.innerHTML = '<div style="width:36px;height:36px;border-radius:12px;background:rgba(255,255,255,0.08);display:flex;align-items:center;justify-content:center;flex-shrink:0">'
        + '<svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="12" r="3" stroke="white" stroke-width="2.2"/></svg>'
        + '</div>'
        + '<div>'
        + '<div style="font-size:17px;font-weight:700;letter-spacing:-0.3px">\u041f\u0440\u043e\u0441\u043c\u043e\u0442\u0440\u044b</div>'
        + '<div id="mv-sub-' + momentId + '" style="font-size:12px;color:rgba(255,255,255,0.42);margin-top:1px">'
        + (cached ? (cached.length + '\u00a0' + _pluralViews(cached.length)) : '\u2014')
        + '</div>'
        + '</div>';

    const closeBtn = document.createElement('button');
    closeBtn.style.cssText = 'width:32px;height:32px;border-radius:50%;background:rgba(255,255,255,0.08);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0';
    closeBtn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none"><line x1="18" y1="6" x2="6" y2="18" stroke="white" stroke-width="2.5" stroke-linecap="round"/><line x1="6" y1="6" x2="18" y2="18" stroke="white" stroke-width="2.5" stroke-linecap="round"/></svg>';
    closeBtn.onclick = () => _closeMvSheet(ov, sh);

    header.appendChild(titleWrap);
    header.appendChild(closeBtn);

    const sep = document.createElement('div');
    sep.style.cssText = 'height:0.5px;background:rgba(255,255,255,0.07);margin:0 20px;flex-shrink:0';

    const listEl = document.createElement('div');
    listEl.id = 'mv-list-' + momentId;
    listEl.style.cssText = 'flex:1;overflow-y:auto;padding:6px 20px 0;-webkit-overflow-scrolling:touch';
    if (!cached) {
        listEl.innerHTML = '<div style="text-align:center;padding:40px 0;opacity:0.3;font-size:14px">\u0417\u0430\u0433\u0440\u0443\u0437\u043a\u0430...</div>';
    }

    let _sy = 0, _ty = 0;
    sh.addEventListener('touchstart', e => { _sy = e.touches[0].clientY; _ty = 0; }, {passive:true});
    sh.addEventListener('touchmove', e => { _ty = e.touches[0].clientY - _sy; if (_ty > 0) sh.style.transform = 'translateY('+_ty+'px)'; }, {passive:true});
    sh.addEventListener('touchend', () => { if (_ty > 90) _closeMvSheet(ov, sh); else { sh.style.transition='transform 0.2s'; sh.style.transform=''; setTimeout(()=>sh.style.transition='',200); } }, {passive:true});

    sh.appendChild(handle);
    sh.appendChild(header);
    sh.appendChild(sep);
    sh.appendChild(listEl);
    ov.appendChild(sh);
    document.body.appendChild(ov);

    if (cached) { _renderViewersList(listEl, cached); return; }

    try {
        const r = await apiFetch('/moment_viewers/' + momentId);
        if (!r || !r.ok) throw new Error('bad');
        const data = await r.json();
        const viewers = Array.isArray(data) ? data : (data.viewers || []);
        _viewersCache[momentId] = viewers;
        const vcnt = document.getElementById('mv-vcnt-' + momentId);
        if (vcnt) vcnt.textContent = viewers.length;
        const sub = document.getElementById('mv-sub-' + momentId);
        if (sub) sub.textContent = viewers.length + '\u00a0' + _pluralViews(viewers.length);
        _renderViewersList(listEl, viewers);
    } catch(e) {
        listEl.innerHTML = '<div style="text-align:center;padding:40px 0;opacity:0.3;font-size:14px">\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044c</div>';
    }
}

function _showPermDeniedGuide(type) {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isPWA = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    const cfg = {
        microphone: { icon:'MIC', name:'Микрофон',
            ios_safari: 'Настройки iPhone → Safari → Микрофон → Разрешить',
            ios_pwa:    'Настройки iPhone → Конфиденциальность → Микрофон → включить WayChat',
            other:      'Нажмите 🔒 в адресной строке браузера → Разрешить микрофон' },
        camera: { icon:'CAM', name:'Камера',
            ios_safari: 'Настройки iPhone → Safari → Камера → Разрешить',
            ios_pwa:    'Настройки iPhone → Конфиденциальность → Камера → включить WayChat',
            other:      'Нажмите 🔒 в адресной строке браузера → Разрешить камеру' },
        notifications: { icon:'BELL', name:'Уведомления',
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
        +'<div style="display:flex;align-items:center;justify-content:center;width:64px;height:64px;border-radius:20px;background:rgba(16,185,129,0.15);margin:0 auto 14px">'+_permIcon(c.icon)+'</div>'
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

function _showPermExplainer(type) {
    return new Promise(resolve => {
        const cfg = {
            microphone:    { icon:'MIC', title:'Доступ к микрофону',    desc:'Нужен для голосовых сообщений и звонков', btn:'Разрешить микрофон' },
            camera:        { icon:'CAM', title:'Доступ к камере',        desc:'Нужен для видеозвонков и аватара',       btn:'Разрешить камеру' },
            notifications: { icon:'BELL', title:'Push-уведомления',       desc:'Чтобы получать сообщения когда приложение закрыто', btn:'Разрешить уведомления' },
        };
        const c = cfg[type] || { icon:'🔑', title:'Разрешение', desc:'', btn:'Продолжить' };

        const ov = document.createElement('div');
        ov.className = 'modal-overlay';
        ov.style.zIndex = '99999';
        const sh = document.createElement('div'); sh.className='modal-sheet';
        sh.innerHTML='<div class="modal-handle"></div>'
            +'<div style="text-align:center;padding:8px 0 20px">'
            +'<div style="display:flex;align-items:center;justify-content:center;width:68px;height:68px;border-radius:20px;background:rgba(16,185,129,0.15);margin:0 auto 14px">'+_permIcon(c.icon)+'</div>'
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

function _skeletonMomentRow() {
    return '<div style="display:flex;align-items:center;gap:14px;padding:11px 2px">'
        + '<div class="skeleton-shimmer" style="width:62px;height:62px;border-radius:50%;flex-shrink:0"></div>'
        + '<div style="flex:1">'
        + '<div class="skeleton-shimmer" style="height:14px;width:130px;border-radius:7px;margin-bottom:9px"></div>'
        + '<div class="skeleton-shimmer" style="height:11px;width:75px;border-radius:6px"></div>'
        + '</div></div>';
}

function _updateGCGrid() {
    const grid = document.getElementById('group-call-grid');
    if (!grid) return;
    const count = grid.querySelectorAll('.gc-tile').length;
    grid.classList.toggle('single', count === 1);
}

async function acquireWakeLock() { try { if ('wakeLock' in navigator) wakelock = await navigator.wakeLock.request('screen'); } catch(e) {} }

async function answerIncomingCall() {
    const data = incomingCallData;
    if (!data) return;
    document.getElementById('accept-btn').style.display = 'none';
    document.getElementById('call-status-label').textContent = 'Подключение...';
    _stopRingtone(); // FIX Task 4c: stop ringtone when answered
    currentPartnerId = data.from;
    currentCallId = data.call_id || currentCallId || ('c_' + Date.now());
    vibrate(30);
    try {
        callLocalStream = await getLocalStream(currentCallType);
        if (currentCallType === 'video') showLocalVideo();
        peerConnection = createPeerConnection();
        callLocalStream.getTracks().forEach(t => peerConnection.addTrack(t, callLocalStream));
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
        await flushPendingIce();
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        socket.emit('answer_call', { to: data.from, answer, call_id: currentCallId });
    } catch(e) { showToast('Ошибка при ответе', 'error'); endCall(true); }
}

function closeChat() {
    // На desktop — показываем пустой экран вместо закрытия
    if (window.matchMedia('(min-width:768px)').matches) {
        document.getElementById('main-content')?.classList.remove('chat-depth');
        const chatWin = document.getElementById('chat-window');
        if (chatWin) chatWin.classList.remove('active');
        const emptyState = document.getElementById('chat-empty-state');
        if (emptyState) emptyState.style.display = 'flex';
        currentChatId = null;
        currentPartnerId = null;
        return;
    }
    const chatWin = document.getElementById('chat-window');
    if(chatWin){
        chatWin.classList.remove('active');
        chatWin.style.height = '';
        chatWin.style.top    = '';
        chatWin.style.bottom = '';
    }
    document.getElementById('main-content')?.classList.remove('chat-depth');
    const fabBtn = document.getElementById('fab-btn-el');
    if(fabBtn) fabBtn.style.display = '';
    const ib = document.querySelector('.input-bar');
    if(ib) ib.style.transform = '';
    if (currentChatId) socket.emit('leave_chat', { chat_id: currentChatId });
    currentChatId    = null;
    currentPartnerId = null;
    currentChatType  = 'private';
    hideTypingIndicator();
    // FIXED: сбрасываем scroll state чтобы следующий чат начинался чисто
    _scrollListenerAttached = false;
    _scrollAtBottom         = true;
    _scrollUnread           = 0;
    VirtualList.destroy();
    loadChats();
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

async function doIceRestart() {
    if (!peerConnection || !currentPartnerId) return;
    try {
        const offer = await peerConnection.createOffer({ iceRestart: true });
        await peerConnection.setLocalDescription(offer);
        socket.emit('call_user', { to: currentPartnerId, from_name: currentUser.name, offer, call_type: currentCallType, isRestart: true, call_id: currentCallId });
    } catch(e) { console.error('ICE restart failed:', e); }
}

function endCall(notify = true) {
    _stopRingtone(); // FIX Task 4c: stop ringtone on endCall
    clearInterval(callTimerInterval); clearInterval(callQualityTimer); clearTimeout(iceRestartTimer);

    if (notify && currentPartnerId) socket.emit('end_call', { to: currentPartnerId, call_id: currentCallId });
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
    if (ci) { ci.style.opacity = '1'; ci.style.display = ''; }
    // Очистка групповых звонков
    if (GC.active) {
        socket.emit('leave_group_call', { room: GC.roomId, user_id: currentUser.id, user_name: currentUser.name });
        Object.values(GC.peers).forEach(p => { try { p.pc.close(); } catch(e) {} });
        GC.peers = {}; GC.active = false; GC.roomId = null;
        const grid = document.getElementById('group-call-grid');
        if (grid) { grid.innerHTML = ''; grid.style.display = 'none'; grid.classList.remove('active'); }
        document.querySelectorAll('[id^="gc-audio-"]').forEach(el => el.remove());
        const addRow = document.getElementById('add-participant-row');
        if (addRow) { addRow.style.opacity = '0'; addRow.style.pointerEvents = 'none'; }
    }
    // FIXED: записываем сообщение о звонке в чат
    const _wasDuration = callStartTime ? Math.floor((Date.now() - callStartTime) / 1000) : 0;
    const _wasType     = currentCallType || 'audio';
    const _wasIncoming = !!incomingCallData;
    const _partnerId   = incomingCallData?.from || currentPartnerId;
    const _chatId      = _getOrCreateChatIdWith(_partnerId);

    callStartTime = null;
    currentCallId = null;
    incomingCallData = null; pendingIce = []; isMuted = false; isVideoOff = false;
    clearTimeout(_callCtrlHideTimer);
    clearTimeout(window._incomingCallTimeout);
    releaseWakeLock(); vibrate(15);

    // Отправляем системное сообщение о звонке
    if (notify && _chatId && _partnerId) {
        const _callLabel = _wasDuration > 0
            ? (_wasIncoming ? '📲 Входящий ' : '📞 Исходящий ') + (_wasType === 'video' ? 'видеозвонок' : 'звонок') + ' · ' + _fmtCallDuration(_wasDuration)
            : (_wasIncoming ? '📵 Пропущенный звонок' : '📞 Звонок отменён');
        socket.emit('send_message', {
            chat_id:  _chatId,
            type_msg: 'call_' + _wasType,
            content:  _callLabel,
            sender_id: currentUser.id,
            client_msg_id: 'calllog_' + Date.now() + '_' + Math.random().toString(36).slice(2,8),
        });
    }
}

function _fmtCallDuration(sec) {
    if (sec < 60) return sec + ' сек';
    return Math.floor(sec/60) + ':' + String(sec%60).padStart(2,'0');
}

function escHtml(s) {
    if (!s) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
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

async function flushPendingIce() {
    const candidates = [...pendingIce]; pendingIce = [];
    for (const c of candidates) { try { await peerConnection.addIceCandidate(new RTCIceCandidate(c)); } catch(e) {} }
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

function hideCallControls() {
    const ctrl = document.getElementById('call-controls');
    if (!ctrl) return;
    ctrl.style.opacity = '0';
    ctrl.style.transform = 'translateY(40px)';
    ctrl.style.pointerEvents = 'none';
}

async function onCallAnswered(data) {
    if (!peerConnection) return;
    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
        await flushPendingIce();
        document.getElementById('call-status-label').textContent = 'Соединение...';
    } catch(e) {}
}

async function onGCAnswer(data) {
    const pc = GC.peers[data.from]?.pc;
    if (pc) await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
}

async function onGCIce(data) {
    const pc = GC.peers[data.from]?.pc;
    if (pc && data.candidate) {
        try { await pc.addIceCandidate(new RTCIceCandidate(data.candidate)); } catch(e) {}
    }
}

async function onGCOffer(data) {
    if (!GC.active) return;
    const { from, offer } = data;
    if (+from === +currentUser.id) return;

    let pc = GC.peers[from]?.pc;
    if (!pc) {
        pc = new RTCPeerConnection(rtcConfig);
        GC.peers[from] = { pc, stream: null };
        callLocalStream?.getTracks().forEach(t => pc.addTrack(t, callLocalStream));

        pc.onicecandidate = e => {
            if (e.candidate) socket.emit('gc_ice', { to: from, candidate: e.candidate, room: GC.roomId });
        };
        pc.ontrack = evt => {
            const stream = evt.streams[0];
            GC.peers[from].stream = stream;
            const t = document.getElementById(`gc-tile-${from}`);
            if (t) {
                const v = t.querySelector('video');
                if (v && GC.type === 'video') { v.srcObject = stream; v.style.display = 'block'; }
            }
            let au = document.getElementById(`gc-audio-${from}`);
            if (!au) { au = document.createElement('audio'); au.id=`gc-audio-${from}`; au.autoplay=true; document.body.appendChild(au); }
            au.srcObject = stream;
            _setupSpeakingDetector(from, stream);
        };
    }

    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket.emit('gc_answer', { to: from, answer, room: GC.roomId });
}

async function onGroupCallJoin(data) {
    if (!GC.active) return;
    const { user_id, user_name, user_avatar } = data;
    if (+user_id === +currentUser.id) return;
    if (Object.keys(GC.peers).length >= GC.MAX) {
        showToast('Максимум участников в звонке', 'warning'); return;
    }

    // Создаём PC для нового участника
    const pc = new RTCPeerConnection(rtcConfig);
    GC.peers[user_id] = { pc, stream: null };

    // Добавляем локальный поток
    callLocalStream?.getTracks().forEach(t => pc.addTrack(t, callLocalStream));

    // Плитка
    const grid = document.getElementById('group-call-grid');
    const tile = _createGCTile(user_id, user_name, user_avatar);
    grid?.appendChild(tile);
    _updateGCGrid();

    // ICE
    pc.onicecandidate = e => {
        if (e.candidate) socket.emit('gc_ice', { to: user_id, candidate: e.candidate, room: GC.roomId });
    };

    // Входящий поток
    pc.ontrack = evt => {
        const stream = evt.streams[0];
        GC.peers[user_id].stream = stream;
        const t = document.getElementById(`gc-tile-${user_id}`);
        if (t) {
            const v = t.querySelector('video');
            if (v) { v.srcObject = stream; v.style.display = 'block'; }
        }
        // Аудио для не-видео звонков
        if (GC.type !== 'video') {
            let au = document.getElementById(`gc-audio-${user_id}`);
            if (!au) {
                au = document.createElement('audio');
                au.id = `gc-audio-${user_id}`;
                au.autoplay = true;
                document.body.appendChild(au);
            }
            au.srcObject = stream;
        }
        // Детектор голоса — подсветка плитки
        _setupSpeakingDetector(user_id, stream);
    };

    // Offer → новый участник
    const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: GC.type === 'video' });
    await pc.setLocalDescription(offer);
    socket.emit('gc_offer', { to: user_id, offer, room: GC.roomId });
}

function onGroupCallLeave(data) {
    const userId = data.user_id;
    const peer = GC.peers[userId];
    if (peer) {
        try { peer.pc.close(); } catch(e) {}
        delete GC.peers[userId];
    }
    const tile = document.getElementById(`gc-tile-${userId}`);
    if (tile) {
        tile.style.animation = 'gcTileOut 0.25s ease forwards';
        setTimeout(() => { tile.remove(); _updateGCGrid(); }, 250);
    }
    const au = document.getElementById(`gc-audio-${userId}`);
    if (au) au.remove();
    showToast(data.user_name + ' покинул звонок', 'info', 2000);
}

async function onIceCandidate(data) {
    if (!data.candidate) return;
    if (!peerConnection || !peerConnection.remoteDescription?.type) { pendingIce.push(data.candidate); return; }
    try { await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate)); } catch(e) {}
}

function onIncomingCall(data) {
    incomingCallData = data;
    currentCallId = data.call_id || currentCallId || ('c_' + Date.now());
    pendingIce = [];
    currentCallType = data.call_type || 'audio';
    vibrate([400,200,400,200,400]);

    // FIXED: убеждаемся что call-screen существует в DOM
    let screen = document.getElementById('call-screen');
    if (!screen) {
        console.warn('[call] call-screen не найден в DOM');
        return;
    }

    // Убираем hidden и display:none
    screen.classList.remove('hidden');
    screen.style.display = '';
    screen.style.opacity = '1';
    screen.style.pointerEvents = 'all';

    const setEl = (id, fn) => { const el = document.getElementById(id); if (el) fn(el); };
    setEl('call-name',         el => el.textContent = data.from_name || 'Звонок');
    setEl('call-status-label', el => el.textContent = currentCallType === 'video' ? '📹 Входящий видеозвонок' : '📞 Входящий звонок');
    setEl('call-avatar-box',   el => el.innerHTML = getAvatarHtml({id:data.from, name:data.from_name, avatar:data.from_avatar||''}, 'w-28 h-28'));
    setEl('accept-btn',        el => { el.style.display = 'flex'; });
    setEl('call-timer',        el => el.style.display = 'none');

    // Показываем кольца анимации
    document.querySelectorAll('.call-ring-1,.call-ring-2,.call-ring-3').forEach(r => r.style.display = 'block');

    acquireWakeLock();
    _playRingtone();

    // FIXED: авто-сброс через 45 секунд если не ответили
    clearTimeout(window._incomingCallTimeout);
    window._incomingCallTimeout = setTimeout(() => {
        if (incomingCallData) {
            _stopRingtone();
            // Отправляем сообщение "Пропущенный звонок" в чат
            socket.emit('send_message', {
                chat_id:   _getOrCreateChatIdWith(data.from),
                type_msg:  'call_' + (currentCallType === 'video' ? 'video' : 'audio'),
                content:   '📵 Пропущенный звонок',
                sender_id: currentUser.id,
            });
            endCall(false);
        }
    }, 45000);

    // Если пользователь уже нажал "Ответить" в push-уведомлении
    if (window._pendingCallAnswer) {
        window._pendingCallAnswer = null;
        setTimeout(() => answerIncomingCall(), 400);
    }
}

// Хелпер: получить chat_id для личного чата с пользователем
function _getOrCreateChatIdWith(userId) {
    const chat = recentChats.find(c =>
        !c.is_group && (c.partner_id === userId || c.partner_id === parseInt(userId))
    );
    return chat ? chat.chat_id : null;
}

function openAddParticipant() {
    if (!GC.active && !callStartTime) return;
    showCallControls();

    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.6);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);display:flex;align-items:flex-end;justify-content:center';

    const sh = document.createElement('div');
    sh.style.cssText = 'background:var(--surface,#111);border-radius:28px 28px 0 0;padding:8px 20px 28px;width:100%;max-width:480px;transform:translateY(100%);transition:transform 0.3s cubic-bezier(.32,.72,0,1)';

    const closeSheet = () => { sh.style.transform='translateY(100%)'; setTimeout(()=>ov.remove(),300); };

    sh.innerHTML = `
        <div style="width:40px;height:4px;background:rgba(255,255,255,0.15);border-radius:2px;margin:10px auto 18px"></div>
        <div style="font-size:18px;font-weight:800;margin-bottom:4px">Добавить в звонок</div>
        <div style="font-size:13px;color:var(--text-2);margin-bottom:18px">Выбери контакт из переписок</div>
        <div id="add-ptc-list" style="display:flex;flex-direction:column;gap:6px;max-height:50vh;overflow-y:auto"></div>
    `;

    const list = sh.querySelector('#add-ptc-list');
    // Берём из recentChats — только личные чаты
    const personal = recentChats.filter(ch => !ch.is_group);
    if (!personal.length) {
        list.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text-2)">Нет контактов</div>';
    }
    personal.slice(0, 20).forEach(ch => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:14px;padding:12px 14px;background:var(--surface2);border-radius:16px;cursor:pointer';
        row.innerHTML = getAvatarHtml({id:ch.partner_id,name:ch.partner_name,avatar:ch.partner_avatar||''},'w-10 h-10')
            + `<div style="flex:1"><div style="font-weight:700">${escHtml(ch.partner_name||'Пользователь')}</div><div style="font-size:12px;color:var(--text-2)">${ch.online?'В сети':'Не в сети'}</div></div>`
            + `<div style="width:32px;height:32px;border-radius:50%;background:var(--accent,#10b981);display:flex;align-items:center;justify-content:center"><svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 10.8 19.79 19.79 0 01.07 2.18 2 2 0 012.07 0h3a2 2 0 012 1.72 12 12 0 00.67 2.68 2 2 0 01-.45 2.11L6.07 7.91a16 16 0 006.02 6.02l1.4-1.22a2 2 0 012.11-.45 12 12 0 002.68.67A2 2 0 0122 16.92z" stroke="black" stroke-width="2" stroke-linecap="round"/></svg></div>`;
        row.onclick = () => {
            closeSheet();
            // Если не в групповом звонке — переводим в групповой
            if (!GC.active) {
                const roomId = `gc_${currentUser.id}_${Date.now()}`;
                GC.active = true; GC.roomId = roomId; GC.type = currentCallType;
                _injectGroupCallCSS();
                const grid = document.getElementById('group-call-grid');
                const callInfo = document.getElementById('call-info');
                if (callInfo) callInfo.style.display = 'none';
                if (grid) { grid.style.display = 'grid'; grid.classList.add('active'); }
                // Перемещаем текущего собеседника в grid
                const selfTile = _createGCTile(currentUser.id, currentUser.name, currentUser.avatar, true);
                grid?.appendChild(selfTile);
                const partnerName = document.getElementById('chat-name')?.textContent || 'Участник';
                const partnerAva  = chatPartnerAvatarSrc[currentPartnerId] || '';
                const pTile = _createGCTile(currentPartnerId, partnerName, partnerAva);
                grid?.appendChild(pTile);
                _updateGCGrid();
                socket.emit('join_group_call', { room: roomId, call_type: currentCallType, from_name: currentUser.name, from_avatar: currentUser.avatar });
            }
            // Приглашаем нового участника
            socket.emit('gc_invite', { to: ch.partner_id, room: GC.roomId, call_type: GC.type, from_name: currentUser.name });
            showToast(`Звонок ${ch.partner_name}...`, 'info', 3000);
        };
        list.appendChild(row);
    });

    ov.appendChild(sh);
    document.body.appendChild(ov);
    requestAnimationFrame(() => requestAnimationFrame(() => { sh.style.transform = 'translateY(0)'; }));
    ov.onclick = e => { if (e.target === ov) closeSheet(); };
}

function openTextMoment() {
    const ov = document.createElement('div');
    ov.className = 'modal-overlay';
    ov.onclick = e => { if (e.target===ov) ov.remove(); };
    const sh = document.createElement('div'); sh.className='modal-sheet';
    sh.innerHTML = '<div class="modal-handle"></div>'
        + '<div style="font-size:17px;font-weight:700;margin-bottom:16px;text-align:center">Текстовый момент</div>'
        + '<textarea id="tm-text" placeholder="Напишите что-нибудь..." style="width:100%;min-height:100px;background:rgba(255,255,255,0.05);border:1px solid var(--border);border-radius:16px;color:#fff;padding:14px;font-size:16px;font-family:inherit;resize:none;outline:none;box-sizing:border-box" maxlength="500"></textarea>'
        + '<div style="text-align:right;font-size:12px;color:var(--text-2);margin:6px 4px 14px" id="tm-cnt">0/500</div>';
    const btn = document.createElement('button');
    btn.style.cssText='width:100%;padding:14px;background:var(--accent);border:none;border-radius:16px;color:#000;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit';
    btn.textContent='Опубликовать';
    btn.onclick = async () => {
        const txt = document.getElementById('tm-text')?.value?.trim();
        if (!txt) return;
        btn.disabled=true; btn.textContent='Публикую...';
        const fd=new FormData(); fd.append('text',txt);
        const r=await fetch('/create_moment',{method:'POST',body:fd,credentials:'include'});
        ov.remove(); momentsCache=null; loadMoments(); showToast('Момент опубликован! 🎉','success');
    };
    const ta = sh.querySelector ? sh : sh;
    sh.appendChild(btn);
    ov.appendChild(sh); document.body.appendChild(ov);
    setTimeout(()=>{
        const ta=document.getElementById('tm-text');
        if(ta){ta.focus();ta.oninput=()=>{const c=document.getElementById('tm-cnt');if(c)c.textContent=ta.value.length+'/500';}}
    },100);
}

function releaseWakeLock() { if (wakelock) { wakelock.release().catch(()=>{}); wakelock = null; } }

function renderMomentsList(container, moments) {
    container.innerHTML = '';

    // Карточка загрузки (если есть активная загрузка) — вставляем первой
    if (_momentUploading && _momentUploadFile) {
        _renderUploadingCard(container);
    }

    if (!moments?.length && !_momentUploading) {
        const empty = document.createElement('div');
        empty.style.cssText = 'text-align:center;opacity:0.25;padding:48px 20px;font-size:15px';
        empty.textContent = 'Моментов пока нет';
        container.appendChild(empty);
        return;
    }

    if (!moments?.length) return;
    currentMoments = moments;

    // Группируем по пользователю
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
        const viewed = !isMe && _viewedMomentUsers.has(uid);

        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:14px;padding:10px 2px;cursor:pointer;border-radius:18px;margin-bottom:2px;-webkit-tap-highlight-color:transparent;transition:background 0.15s';
        row.onclick = () => openUserMomentsViewer(uid);
        row.onpointerdown = () => row.style.background = 'rgba(255,255,255,0.04)';
        row.onpointerup = () => row.style.background = '';
        row.onpointercancel = () => row.style.background = '';

        // Аватар с SVG кольцом
        const avaWrap = document.createElement('div');
        avaWrap.style.cssText = 'position:relative;flex-shrink:0;width:62px;height:62px';

        const avaInner = document.createElement('div');
        avaInner.style.cssText = 'position:absolute;inset:4px;border-radius:50%;overflow:hidden';
        avaInner.innerHTML = getAvatarHtml({id:uid, name:first.user_name, avatar:first.user_avatar}, 'w-full h-full');
        avaWrap.appendChild(avaInner);

        // SVG кольцо
        const NS = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(NS, 'svg');
        svg.setAttribute('width','62'); svg.setAttribute('height','62'); svg.setAttribute('viewBox','0 0 62 62');
        svg.style.cssText = 'position:absolute;inset:0;pointer-events:none';
        const CX=31, CY=31, R=29;
        const GAP_DEG = cnt > 1 ? 6 : 0;
        const SEG_DEG = (360 - GAP_DEG * cnt) / cnt;
        const ringColor = viewed ? 'rgba(255,255,255,0.2)' : 'var(--accent)';
        for (let i=0; i<cnt; i++) {
            const s = -90 + i*(SEG_DEG+GAP_DEG), e = s + SEG_DEG;
            const tr = d => d*Math.PI/180;
            const x1=CX+R*Math.cos(tr(s)), y1=CY+R*Math.sin(tr(s));
            const x2=CX+R*Math.cos(tr(e)), y2=CY+R*Math.sin(tr(e));
            const path = document.createElementNS(NS, 'path');
            path.setAttribute('d', `M${x1.toFixed(2)} ${y1.toFixed(2)} A${R} ${R} 0 ${SEG_DEG>180?1:0} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`);
            path.setAttribute('stroke', ringColor);
            path.setAttribute('stroke-width', viewed ? '2.5' : '3.5');
            path.setAttribute('fill','none');
            path.setAttribute('stroke-linecap','round');
            svg.appendChild(path);
        }
        avaWrap.appendChild(svg);
        row.appendChild(avaWrap);

        // Инфо справа
        const info = document.createElement('div');
        info.style.cssText = 'flex:1;min-width:0';
        const mediaLabel = first.media_url
            ? (first.media_url.match(/\.(mp4|mov|webm)/i) ? '🎥 Видео' : '📷 Фото')
            : '';
        const preview = first.text || mediaLabel;
        info.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px">'
            + '<div style="font-weight:700;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + escHtml(first.user_name) + (isMe?' <span style="font-size:12px;color:var(--text-2);font-weight:500">(Вы)</span>':'') + '</div>'
            + '<div style="display:flex;align-items:center;gap:6px;flex-shrink:0">'
            + (cnt>1 ? '<span style="font-size:11px;background:var(--accent);color:black;border-radius:10px;padding:2px 7px;font-weight:800">'+cnt+'</span>' : '')
            + '<span style="font-size:12px;color:var(--text-2)">'+first.timestamp+'</span>'
            + '</div></div>'
            + '<div style="font-size:13px;color:var(--text-2);margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;opacity:'+(viewed?'0.45':'0.8')+'">'+(preview||'')+'</div>';
        row.appendChild(info);
        container.appendChild(row);
    });

    // Предзагрузка первых 5 медиа в фоне
    moments.slice(0, 5).forEach(m => {
        if (m.media_url && !m.media_url.match(/\.(mp4|mov|webm)/i)) {
            // Для фото — предзагружаем через Image
            if (!_mediaCache.has(m.media_url)) {
                const img = new Image();
                img.src = m.media_url;
            }
        }
        // Для видео — только первые 2 (тяжёлые)
    });
    if (moments[0]?.media_url) _preloadMedia(moments[0].media_url);
    if (moments[1]?.media_url) _preloadMedia(moments[1].media_url);
}

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
                microphone: { icon:'MIC', title:'Доступ к микрофону', desc:'Нужен для голосовых сообщений и звонков', btn:'Разрешить микрофон' },
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
                + '<div style="display:flex;align-items:center;justify-content:center;width:72px;height:72px;border-radius:20px;background:rgba(16,185,129,0.15);margin:0 auto 16px">'+_permIcon(c.icon)+'</div>'
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

function scrollDown(smooth = true) {
    VirtualList.scrollToBottom(smooth);
    // FIX: clear unread badge when scrolling to bottom
    const badge = document.getElementById('wc-scroll-badge');
    if (badge) { badge.textContent = ''; badge.style.display = 'none'; }
    // FIX SCROLL-BTN: hide button immediately
    _scrollAtBottom = true; _scrollUnread = 0;
    const _msgsEl = document.getElementById('messages');
    if (_msgsEl) _updateScrollBtn(_msgsEl);
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
    // Автоскрытие кнопок через 3с
    showCallControls();
    _callCtrlHideTimer = setTimeout(hideCallControls, 3000);
}

function setupGlobalGestures() {
    let startX = 0, startY = 0;

    // ── Свайп из края экрана → назад из чата ──
    document.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
    }, { passive: true });

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

    // ── Свайп вниз на списке чатов → показать Moments ──
    _setupMomentsPullDown();

    // ── Свайп по чату в списке (вправо / влево) ──
    _setupChatListSwipes();
}

function showCallControls() {
    const ctrl = document.getElementById('call-controls');
    if (!ctrl) return;
    ctrl.style.opacity = '1';
    ctrl.style.transform = 'translateY(0)';
    ctrl.style.pointerEvents = 'auto';
    clearTimeout(_callCtrlHideTimer);
    _callCtrlHideTimer = setTimeout(hideCallControls, 3000);
}

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

async function startCall(type) {
    if (!currentPartnerId) return;
    currentCallType = type; iceRestartCount = 0;
    vibrate(50);
    setupCallScreen(type, false);
    pendingIce = [];
    currentCallId = 'c_' + Date.now() + '_' + Math.random().toString(36).slice(2,8);
    _speakerOn = true;
    try {
        callLocalStream = await getLocalStream(type);
        if (type === 'video') showLocalVideo();
        peerConnection = createPeerConnection();
        callLocalStream.getTracks().forEach(t => peerConnection.addTrack(t, callLocalStream));
        const offer = await peerConnection.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: type === 'video' });
        await peerConnection.setLocalDescription(offer);
        socket.emit('call_user', { to: currentPartnerId, from_name: currentUser.name, from_avatar: currentUser.avatar, offer, call_type: type, call_id: currentCallId });
        // FIX CALL STUCK: update status after 5s, end after 30s
        setTimeout(() => {
            const lbl = document.getElementById('call-status-label');
            if (lbl && peerConnection && ['new','checking'].includes(peerConnection.iceConnectionState))
                lbl.textContent = 'Ожидание ответа...';
        }, 5000);
        setTimeout(() => {
            if (peerConnection && ['new','checking'].includes(peerConnection.iceConnectionState)) {
                showToast('Абонент не отвечает', 'warning'); endCall(true);
            }
        }, 30000);
    } catch(e) {
        console.error('startCall:', e); endCall(false);
        if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
            showToast('Разрешите доступ в Настройки → Safari → Камера/Микрофон', 'error', 6000);
        } else {
            showToast('Ошибка доступа к медиа: ' + (e.message || e.name), 'error', 4000);
        }
    }
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

async function startGroupCall(type, roomId) {
    if (GC.active) return;
    _injectGroupCallCSS();
    GC.active = true;
    GC.type   = type || 'audio';
    GC.roomId = roomId || `gc_${Date.now()}`;
    GC.peers  = {};

    setupCallScreen(type, false);
    // Скрываем 1:1 инфо, показываем grid
    const callInfo = document.getElementById('call-info');
    if (callInfo) callInfo.style.display = 'none';
    const grid = document.getElementById('group-call-grid');
    if (grid) { grid.style.display = 'grid'; grid.classList.add('active'); }

    // Показываем кнопку + участника
    _showAddParticipantBtn();

    // Инициализируем локальный поток
    try {
        callLocalStream = await getLocalStream(type);
    } catch(e) {
        showToast('Нет доступа к микрофону', 'error'); endCall(false); return;
    }

    // Плитка себя
    const selfTile = _createGCTile(currentUser.id, currentUser.name, currentUser.avatar, true);
    grid.appendChild(selfTile);
    if (type === 'video') {
        const selfVid = selfTile.querySelector('video');
        if (selfVid) { selfVid.srcObject = callLocalStream; selfVid.style.display = 'block'; }
    }
    _updateGCGrid();

    // Уведомляем сервер — войти в комнату
    socket.emit('join_group_call', { room: GC.roomId, call_type: type, from_name: currentUser.name, from_avatar: currentUser.avatar });

    startCallTimer();
    showCallControls();
    _callCtrlHideTimer = setTimeout(hideCallControls, 3000);
}

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

function toggleSpeaker() {
    const btn = document.getElementById('speaker-btn');
    btn?.classList.toggle('active');
    showToast('Громкая связь переключена', 'info', 1500); vibrate(10);
}

function toggleVideo() {
    isVideoOff = !isVideoOff;
    callLocalStream?.getVideoTracks().forEach(t => t.enabled = !isVideoOff);
    const btn = document.getElementById('video-btn');
    if (btn) { btn.classList.toggle('active', isVideoOff); }
    vibrate(10);
}
window.WayChat = {
    version: '8.0.0',

    /**
     * handleCallAction(action, fromId, callId)
     * action: 'answer' | 'decline'
     * Called by: index.html on SW message or URL deep link
     */
    handleCallAction: function(action, fromId, callId) {
        if (action === 'answer') {
            if (typeof incomingCallData !== 'undefined' && incomingCallData) {
                // Call UI already showing (socket arrived first)
                if (typeof answerIncomingCall === 'function') answerIncomingCall();
            } else {
                // Socket hasn't arrived yet — store intent, handle in onIncomingCall
                window._pendingCallAnswer = { fromId, callId };
                // Show waiting UI
                var screen = document.getElementById('call-screen');
                if (screen) {
                    screen.classList.remove('hidden');
                    var lbl = document.getElementById('call-status-label');
                    if (lbl) lbl.textContent = 'Ожидание звонка...';
                    // FIX Task 4c: start ringtone while waiting
                    if (typeof _playRingtone === 'function') _playRingtone();
                }
            }
        } else if (action === 'decline') {
            if (typeof socket !== 'undefined' && socket) {
                socket.emit('call_declined', {
                    from_id: fromId,
                    call_id: callId,
                    to:      fromId,
                });
            }
            var screen = document.getElementById('call-screen');
            if (screen) screen.classList.add('hidden');
            if (typeof _stopRingtone === 'function') _stopRingtone();
        }
    },

    /**
     * openChatById(chatId)
     * Called by: index.html on SW open_chat message
     */
    openChatById: function(chatId) {
        if (!chatId) return;
        // FIX P3: не открывать удалённые чаты из push-уведомлений
        if (typeof _deletedChatIds !== 'undefined' && _deletedChatIds.has(chatId)) return;
        var found = recentChats && recentChats.find(function(c) {
            return c.chat_id === chatId;
        });
        if (found) {
            if (found.is_group) {
                openGroupChat(found.group_id || found.partner_id,
                    found.group_name || found.partner_name,
                    found.group_avatar || found.partner_avatar);
            } else {
                openChat(found.partner_id, found.partner_name, found.partner_avatar);
            }
        } else {
            // Chat not in cache — reload list first
            loadChats().then && loadChats().then(function() {
                window.WayChat.openChatById(chatId);
            });
        }
    },
};

// Process any pending SW actions that arrived before WayChat was ready
if (window._pendingSWCallAction) {
    var a = window._pendingSWCallAction;
    window._pendingSWCallAction = null;
    window.WayChat.handleCallAction(a.action, a.from_id, a.call_id);
}
if (window._pendingSWOpenChat) {
    var cid = window._pendingSWOpenChat;
    window._pendingSWOpenChat = null;
    setTimeout(function() { window.WayChat.openChatById(cid); }, 500);
}
// ══ END WAYCHAT API ═══════════════════════════════════════════════

// ══ CSS анимации ══
(() => {
    const s = document.createElement('style');
    s.textContent = `
        @keyframes mpBar0 { from{transform:scaleY(.25)} to{transform:scaleY(1)} }
        @keyframes mpBar1 { from{transform:scaleY(.45)} to{transform:scaleY(1.15)} }
        @keyframes mpBar2 { from{transform:scaleY(.3)}  to{transform:scaleY(.85)} }
        @keyframes mpSpin { to{transform:rotate(360deg)} }
        #music-section { will-change:transform; }
    `;
    document.head.appendChild(s);
})();
