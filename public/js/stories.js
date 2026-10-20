// HISTORIAS (#361, owner 2026-10-17): contenido que publica el admin desde el panel y que el
// cliente ve arriba a la derecha (al lado de Perfil), estilo historias: pantalla completa,
// barras de progreso, pasa sola, tocar a la derecha/izquierda avanza/retrocede, mantener
// apretado pausa. Las historias vencen solas (horas configurables en el panel).
(function () {
    'use strict';
    window.VIP = window.VIP || {};

    const SEEN_KEY = 'vip_stories_seen';
    let _items = [];
    let _idx = 0;
    let _timer = null;
    let _startedAt = 0;
    let _remaining = 0;
    let _paused = false;
    let _refreshTimer = null;

    function _el(id) { return document.getElementById(id); }
    function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
    function _seen() { try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'); } catch (_) { return []; } }
    function _markSeen(id) {
        try { const s = _seen(); if (!s.includes(id)) { s.push(id); localStorage.setItem(SEEN_KEY, JSON.stringify(s.slice(-200))); } } catch (_) {}
    }

    async function load() {
        const btn = _el('navHistorias');
        if (!btn) return;
        try {
            const r = await fetch(VIP.config.API_URL + '/api/stories/active', { headers: { 'Authorization': 'Bearer ' + VIP.state.currentToken } });
            if (!r.ok) throw new Error('HTTP ' + r.status);
            const j = await r.json();
            _items = Array.isArray(j.items) ? j.items : [];
        } catch (_) { _items = []; }
        _paintButton();
        clearInterval(_refreshTimer);
        _refreshTimer = setInterval(() => { if (!document.hidden) load(); }, 5 * 60 * 1000);
    }

    function _paintButton() {
        const btn = _el('navHistorias'); if (!btn) return;
        const seen = _seen();
        const unseen = _items.filter((s) => !seen.includes(s.id)).length;
        btn.classList.toggle('has-active', _items.length > 0);
        btn.classList.toggle('has-new', unseen > 0);
        const badge = _el('storiesBadge');
        if (badge) { badge.textContent = unseen > 9 ? '9+' : String(unseen); badge.style.display = unseen > 0 ? '' : 'none'; }
        const lbl = _el('storiesLbl');
        if (lbl) lbl.textContent = _items.length ? (unseen ? 'Historias' : 'Historias') : 'Historias';
        btn.title = _items.length ? (_items.length + ' historia' + (_items.length === 1 ? '' : 's') + ' activa' + (_items.length === 1 ? '' : 's')) : 'Sin historias por ahora';
    }

    function open(startIdx) {
        if (!_items.length) {
            if (VIP.ui && VIP.ui.showToast) VIP.ui.showToast('Todavía no hay historias. ¡Pronto!', 'info');
            load();
            return;
        }
        const v = _el('storyViewer'); if (!v) return;
        const seen = _seen();
        let i = typeof startIdx === 'number' ? startIdx : _items.findIndex((s) => !seen.includes(s.id));
        if (i < 0) i = 0;
        _idx = i;
        v.classList.add('open');
        document.body.classList.add('story-open');
        _render();
    }

    function close() {
        const v = _el('storyViewer'); if (!v) return;
        clearTimeout(_timer); _timer = null;
        const vid = v.querySelector('video'); if (vid) { try { vid.pause(); } catch (_) {} }
        v.classList.remove('open');
        document.body.classList.remove('story-open');
        _paintButton();
    }

    function _render() {
        const v = _el('storyViewer'); const s = _items[_idx];
        if (!v || !s) { close(); return; }
        clearTimeout(_timer); _paused = false;
        // barras
        const bars = _el('storyBars');
        if (bars) bars.innerHTML = _items.map((_, i) => '<i class="' + (i < _idx ? 'done' : (i === _idx ? 'cur' : '')) + '"><b></b></i>').join('');
        // cabecera
        const when = _el('storyWhen'); if (when) when.textContent = _ago(s.publishedAt);
        const ttl = _el('storyTitle'); if (ttl) ttl.textContent = s.title || 'PICA ROJA oficial';
        // media
        const media = _el('storyMedia');
        media.style.background = s.bgColor || '#06070d';
        try { v.style.background = ''; } catch (_) {} // #615: el visor queda negro; el color de la historia va sólo en el marco 9:16 (st-media)
        let dur = Math.max(2, Number(s.durationSec) || 6) * 1000;
        if (s.mediaType === 'video' && s.mediaUrl) {
            media.innerHTML = '<video src="' + _esc(s.mediaUrl) + '" playsinline autoplay muted preload="auto"></video>';
            const vid = media.querySelector('video');
            vid.addEventListener('loadedmetadata', () => { if (isFinite(vid.duration) && vid.duration > 1) { dur = Math.min(60000, vid.duration * 1000); _arm(dur); } });
            vid.addEventListener('ended', () => next());
            vid.play().catch(() => {});
        } else if (s.mediaType === 'image' && s.mediaUrl) {
            media.innerHTML = '<div class="st-blur" style="background-image:url(' + _esc(s.mediaUrl) + ')"></div><img src="' + _esc(s.mediaUrl) + '" alt="">';
        } else {
            media.innerHTML = '<div class="st-textonly">' + _esc(s.text || s.title || '') + '</div>';
        }
        // texto + link
        const cap = _el('storyCaption');
        if (cap) { cap.textContent = (s.mediaType !== 'none' && s.text) ? s.text : ''; cap.style.display = cap.textContent ? '' : 'none'; }
        // #453 (owner): en las historias con FOTO/VIDEO el texto no se superpone (la foto va completa, con el sello de marca abajo).
        // #582: el texto se muestra también en las historias con foto (tarjeta debajo de la imagen); en las de texto solo ya va grande en el medio
        try { if (cap) cap.style.display = (s.mediaType === 'none') ? 'none' : ''; } catch (_) {}
        const link = _el('storyLink');
        if (link) {
            // #474 (owner): links internos "app:<sección>" → cierran la historia y abren esa parte de la app.
            const APP_LINKS = { referidos: () => VIP.ui.openReferralModal(), cargar: () => { try { VIP.home.easyLoad(); } catch (_) { VIP.home.setHomeMode('mini'); } }, ruleta: () => VIP.roulette.open(), reembolso: () => VIP.refunds.showRefundModal(), verificar: () => VIP.home.openVerifyPhone(), soporte: () => VIP.home.setHomeMode('mini'), misiones: () => VIP.home.openMissions() }; // #646: verificar (Perfil → teléfono) y soporte
            const appKey = /^app:(\w+)$/i.exec(s.linkUrl || '');
            if (appKey) { link.href = '#'; link.textContent = s.linkLabel || 'Me interesa ›'; link.style.display = ''; link.onclick = (ev) => { ev.preventDefault(); close(); const fn = APP_LINKS[appKey[1].toLowerCase()]; try { if (fn) fn(); } catch (e) { console.warn('[stories] app link', e); } }; }
            else if (s.linkUrl) { link.href = s.linkUrl; link.onclick = null; link.textContent = s.linkLabel || 'Ver más ›'; link.style.display = ''; }
            else link.style.display = 'none';
        }
        _markSeen(s.id);
        try { if (VIP.state && VIP.state.currentToken) fetch(VIP.config.API_URL + '/api/stories/' + encodeURIComponent(s.id) + '/view', { method: 'POST', headers: { 'Authorization': 'Bearer ' + VIP.state.currentToken } }).catch(() => {}); } catch (_) {}
        _arm(dur);
    }

    function _arm(dur) {
        clearTimeout(_timer);
        _remaining = dur; _startedAt = Date.now();
        const cur = document.querySelector('#storyBars i.cur b');
        if (cur) { cur.style.transition = 'none'; cur.style.width = '0%'; void cur.offsetWidth; cur.style.transition = 'width ' + dur + 'ms linear'; cur.style.width = '100%'; }
        _timer = setTimeout(next, dur);
    }

    function pause() {
        if (_paused || !_timer) return;
        _paused = true; clearTimeout(_timer);
        _remaining = Math.max(300, _remaining - (Date.now() - _startedAt));
        const cur = document.querySelector('#storyBars i.cur b');
        if (cur) { const w = getComputedStyle(cur).width; cur.style.transition = 'none'; cur.style.width = w; }
        const vid = document.querySelector('#storyMedia video'); if (vid) { try { vid.pause(); } catch (_) {} }
    }
    function resume() {
        if (!_paused) return;
        _paused = false; _startedAt = Date.now();
        const cur = document.querySelector('#storyBars i.cur b');
        if (cur) { void cur.offsetWidth; cur.style.transition = 'width ' + _remaining + 'ms linear'; cur.style.width = '100%'; }
        const vid = document.querySelector('#storyMedia video'); if (vid) { vid.play().catch(() => {}); }
        _timer = setTimeout(next, _remaining);
    }

    function next() { if (_idx + 1 < _items.length) { _idx += 1; _render(); } else close(); }
    function prev() { if (_idx > 0) { _idx -= 1; _render(); } else _render(); }

    function _ago(d) {
        const t = new Date(d).getTime(); if (!t) return '';
        const m = Math.max(1, Math.round((Date.now() - t) / 60000));
        if (m < 60) return 'hace ' + m + ' min';
        const h = Math.round(m / 60); if (h < 24) return 'hace ' + h + ' h';
        return 'hace ' + Math.round(h / 24) + ' d';
    }

    function init() {
        const v = _el('storyViewer'); if (!v) return;
        let holdT = null, held = false, downX = 0;
        const zone = _el('storyTap');
        if (zone) {
            zone.addEventListener('pointerdown', (e) => { try { zone.setPointerCapture(e.pointerId); } catch (_) {} downX = e.clientX; held = false; holdT = setTimeout(() => { held = true; pause(); }, 150); }); // #655: 150 ms y captura del puntero (no se pierde al mover el dedo)
            zone.addEventListener('contextmenu', (e) => e.preventDefault()); // #655: sin menú de guardar imagen al mantener
            zone.addEventListener('pointerup', (e) => {
                clearTimeout(holdT);
                if (held) { resume(); return; }
                const w = zone.clientWidth || 1;
                if ((e.clientX - zone.getBoundingClientRect().left) < w * 0.3) prev(); else next();
            });
            zone.addEventListener('pointercancel', () => { clearTimeout(holdT); if (held) resume(); });
            zone.addEventListener('pointerleave', () => { clearTimeout(holdT); if (held) resume(); });
        }
        document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); else if (v.classList.contains('open')) resume(); });
        document.addEventListener('keydown', (e) => { if (!v.classList.contains('open')) return; if (e.key === 'Escape') close(); if (e.key === 'ArrowRight') next(); if (e.key === 'ArrowLeft') prev(); });
    }

    // #416/#417: historias en la PANTALLA DE INGRESO (sin sesión): /api/stories/public → ANILLO tipo Instagram arriba a la
    // derecha (#lgStoriesRing, sólo si hay historias); tocarlo abre el visor desde la primera.
    async function loadPublic(ringId) {
        const ring = _el(ringId || 'lgStoriesRing'); if (!ring) return;
        try {
            const r = await fetch(VIP.config.API_URL + '/api/stories/public');
            if (!r.ok) throw new Error('HTTP ' + r.status);
            const j = await r.json();
            _items = Array.isArray(j.items) ? j.items : [];
        } catch (_) { _items = []; }
        if (!_items.length) { ring.style.display = 'none'; return; }
        const seen = _seen(); const unseen = _items.filter((s) => !seen.includes(s.id)).length;
        ring.classList.toggle('has-new', unseen > 0);
        const n = _el('lgStoriesCount'); if (n) { n.textContent = String(_items.length); n.style.display = ''; }
        ring.title = _items.length + ' historia' + (_items.length === 1 ? '' : 's');
        ring.style.display = '';
    }
    VIP.stories = { init, load, loadPublic, open, close, next, prev, pause, resume };
})();
