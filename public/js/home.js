// =====================================================================
// HOME 2.0 — "la carga automática primero, el chat como soporte" (2026-10-16, #220)
//
// Pedido del owner: cuando el cliente entra NO ve el chat; ve la CARGA AUTOMÁTICA
// (CBU/alias/datos de acceso — autoload.js), abajo las PLATAFORMAS para elegir
// dónde jugar después de cargar (reemplaza al botón "PÁGINA CASINO AQUÍ"), y una
// explicación automática de cómo funciona el servicio (reembolsos resumidos + dos
// plataformas). El chat queda como SOPORTE: la barra verde arriba abre un panel
// a pantalla completa con el chat de siempre (mismos ids: chatMessages,
// messageInput, attachBtn… nada del cableado viejo cambia).
//
// Este módulo:
//   • abre/cierra el panel de soporte (#supportPanel) y lleva el contador de
//     mensajes sin leer en la barra;
//   • si llega la pregunta "¿dónde querés jugar?" (metadata platform_choice) con
//     el chat cerrado, lo ABRE solo para que el cliente vea los botones;
//   • dibuja la tarjeta de plataformas (GET /api/platforms) y la de "cómo funciona"
//     (con la escalera de reembolsos real de VIP.state.refundStatus);
//   • engancha todo al login envolviendo VIP.ui.showChatScreen.
// =====================================================================
(function () {
    'use strict';
    window.VIP = window.VIP || {};

    let _unread = 0;
    let _open = false;
    let _platforms = null;
    let _platformsAt = 0;

    function _el(id) { return document.getElementById(id); }
    function _esc(s) { const d = document.createElement('div'); d.textContent = String(s == null ? '' : s); return d.innerHTML; }

    // ---------------- #266: CHAT PRINCIPAL + MENÚ DESLIZANTE ----------------
    // (owner 2026-10-17: "un menú deslizante para arriba ocultando todo y dejar el chat como principal;
    //  si quiere el % o ver más de la app que pueda expandir todo lo que ya tenemos").
    //   mini (default) → body.home-mini: #homeFull plegado (max-height 0), #supportPanel INLINE con la
    //                    cabecera estilo WhatsApp (#waHead) y el botón CBU en la barra de escribir.
    //   full            → el home de siempre; el chat vuelve a ser overlay (burbuja).
    // Se recuerda por dispositivo (localStorage vip_home_mode). El cartel viene de /api/platforms.
    // #267: tercer modo **play** (el de ENTRADA, siempre al abrir la app): la plataforma abierta adentro
    //       (#entryView: tabs Girox/Ganamos + iframe público) y abajo "Carga manual" (→ mini) /
    //       "Carga automática" (→ full). El modo elegido se recuerda sólo en la SESIÓN (sessionStorage):
    //       cada vez que se abre la app, la gente ve de entrada la plataforma.
    const HOME_MODE_KEY = 'vip_home_mode';
    const HOME_BANNER_KEY = 'vip_home_banner';
    let _homeMode = 'play';
    let _headObs = null;

    function getHomeMode() { return _homeMode; }
    function setHomeMode(mode, opts) {
        mode = (mode === 'full' || mode === 'mini') ? mode : 'play';
        _homeMode = mode;
        const p = _el('supportPanel');
        const cta = _el('serviceBannerCta');
        const bn = _el('serviceBanner');
        document.body.classList.toggle('home-mini', mode === 'mini');
        document.body.classList.toggle('home-play', mode === 'play');
        document.body.classList.toggle('home-full', mode === 'full'); // #269: carga automática SENCILLA (CSS esconde lo demás)
        document.body.classList.remove('support-open');
        _paintNav();
        if (mode === 'play') {
            if (p) p.classList.add('hidden');
            _open = false;
            try { const bb = _el('supportBubble'); if (bb) bb.style.visibility = ''; } catch (_) {}
            try { const i = _el('messageInput'); if (i) i.blur(); } catch (_) {}
            renderEntryTabs();
            _entryLoad();
        } else {
            _entryUnload();
        }
        if (mode === 'mini') {
            if (p) p.classList.remove('hidden');
            _open = true; _unread = 0; _paintBadge();
            if (cta) cta.textContent = 'Ver todo ▾';
            if (bn) { bn.setAttribute('aria-expanded', 'false'); bn.title = 'Ver la app completa'; }
            try { VIP.chat.markReceivedAsRead(); } catch (_) {}
            setTimeout(() => { try { VIP.chat.scrollToBottom(); } catch (_) {} }, 80);
        } else {
            if (p) p.classList.add('hidden');
            _open = false;
            try { const bb = _el('supportBubble'); if (bb) bb.style.visibility = ''; } catch (_) {}
            if (cta) cta.textContent = '▴ Ocultar · ir al chat';
            if (bn) { bn.setAttribute('aria-expanded', 'true'); bn.title = 'Volver al chat'; }
            try { const i = _el('messageInput'); if (i) i.blur(); } catch (_) {}
        }
        if (!opts || opts.persist !== false) { try { sessionStorage.setItem(HOME_MODE_KEY, mode); } catch (_) {} }
    }
    function toggleHomeMode() { setHomeMode(_homeMode === 'mini' ? 'full' : 'mini'); }
    // #268: barra de arriba — resalta la sección activa.
    function _paintNav() {
        const map = { navInicio: 'play', navAuto: 'full', navManual: 'mini' };
        Object.keys(map).forEach((id) => { const b = _el(id); if (b) b.classList.toggle('active', map[id] === _homeMode); });
    }
    // ---------------- #268: PERFIL ----------------
    let _pfShown = false;
    function _pfPaint() {
        const u = (VIP.state && VIP.state.currentUser && VIP.state.currentUser.username) || '—';
        const pw = (VIP.autoload && VIP.autoload.getPassword && VIP.autoload.getPassword()) || '';
        const eu = _el('pfUser'), ep = _el('pfPass'), eye = _el('pfEye'), hint = _el('pfHint');
        if (eu) eu.textContent = u;
        if (ep) ep.textContent = pw ? (_pfShown ? pw : '•'.repeat(Math.min(12, Math.max(6, pw.length)))) : 'no guardada';
        if (eye) { eye.textContent = _pfShown ? 'Ocultar' : 'Ver'; eye.style.display = pw ? '' : 'none'; }
        if (hint) {
            hint.textContent = !pw ? 'Tu clave no está guardada en este dispositivo. Si la cambiás desde acá, queda guardada.'
                : (pw === 'asd123' ? 'Es la clave inicial: te recomendamos cambiarla desde "Cambiar clave".' : 'Es la misma clave para entrar a la app y a las plataformas.');
        }
    }
    function openProfile() {
        _pfShown = false;
        _pfPaint();
        try { VIP.ui.showModal('profileModal'); } catch (_) { const m = _el('profileModal'); if (m) m.classList.remove('hidden'); }
    }
    function profileTogglePw() { _pfShown = !_pfShown; _pfPaint(); }
    function profileCopy(which) {
        const v = which === 'pass' ? ((VIP.autoload && VIP.autoload.getPassword && VIP.autoload.getPassword()) || '') : ((VIP.state && VIP.state.currentUser && VIP.state.currentUser.username) || '');
        if (!v) { try { VIP.ui.showToast('No hay nada para copiar', 'info'); } catch (_) {} return; }
        try { VIP.ui.copyText(v); } catch (_) { try { navigator.clipboard.writeText(v); } catch (__) {} }
    }
    function _initHomeMode() {
        let m = 'play';
        try { const v = sessionStorage.getItem(HOME_MODE_KEY); if (v === 'full' || v === 'mini') m = v; } catch (_) {}
        _bindEntryFrame();
        setHomeMode(m, { persist: false });
        try { const c = localStorage.getItem(HOME_BANNER_KEY); if (c) _paintHomeBanner(JSON.parse(c)); } catch (_) {}
        _mirrorHeadBits();
        _watchHeadBits();
    }
    // Cartel: el texto ya viene renderizado del server ({pct} resuelto). text === null ⇒ vaciado en
    // COMANDOS → sólo el título. El "N%" se resalta en verde.
    function _paintHomeBanner(hb) {
        const msg = _el('serviceBannerMsg');
        if (!msg || !hb || typeof hb !== 'object') return;
        // #267: el % también va en el botón "Carga automática" de la pantalla de entrada.
        try { const ap = _el('evAutoSub'); if (ap && hb.pct != null && hb.pct !== '') ap.textContent = hb.pct + '% en todas tus cargas'; } catch (_) {}
        if (hb.text === null || hb.text === '') { msg.style.display = 'none'; return; }
        msg.innerHTML = _esc(hb.text).replace(/(\d+(?:[.,]\d+)?\s?%)/g, '<em>$1</em>');
        msg.style.display = '';
    }
    // La cabecera WhatsApp copia lo que ya pintan otros módulos: ícono ☀️/🌙 (app.js en #themeToggleBtn),
    // racha del fueguito (#fireStreak) y logo del chat (#chatTopbarAvatar, lo cambia chat.js por config).
    function _mirrorHeadBits() {
        try { const t = _el('themeToggleBtn'), w = _el('waThemeBtn'); if (t && w && t.textContent) w.textContent = t.textContent; } catch (_) {}
        try { const src = _el('fireStreak'), dst = _el('waFireStreak'); if (src && dst) { dst.textContent = src.textContent; dst.style.display = src.style.display; } } catch (_) {}
        try { const av = _el('chatTopbarAvatar'), wa = _el('waHeadAvatar'); const u = av && av.getAttribute('src'); if (u && wa && wa.getAttribute('src') !== u) wa.src = u; } catch (_) {}
    }
    function _watchHeadBits() {
        if (_headObs) return;
        try {
            _headObs = new MutationObserver(() => _mirrorHeadBits());
            ['fireStreak', 'themeToggleBtn', 'chatTopbarAvatar'].forEach((id) => { const n = _el(id); if (n) _headObs.observe(n, { childList: true, characterData: true, subtree: true, attributes: true }); });
        } catch (_) { _headObs = true; setInterval(_mirrorHeadBits, 2000); }
    }
    // ---------------- #267: PANTALLA DE ENTRADA (plataforma abierta adentro) ----------------
    // Antes de que responda /api/platforms (Tor es lento) se muestran Girox y Ganamos fijos con sus
    // webs públicas; después se re-renderiza con la lista real (misma URL ⇒ no se recarga el iframe).
    const ENTRY_FALLBACK = [
        { id: 'girox', name: 'Girox', playUrl: 'https://1girox.com', connected: true, logoUrl: '/images/soporte-1girox.png' },
        { id: 'ganamos', name: 'Ganamos', playUrl: 'https://www.ganamosvip.me', connected: false, logoUrl: '/images/ganamos.svg' }
    ];
    let _entryPlat = null, _entryUrl = '', _entryTimer = null, _entryBound = false;
    function _entryList() { const l = (_platforms && _platforms.platforms) || []; return l.length ? l : ENTRY_FALLBACK; }
    function renderEntryTabs() {
        const box = _el('entryTabs'); if (!box) return;
        const list = _entryList();
        if (!_entryPlat || !list.some((p) => p.id === _entryPlat)) {
            const def = (_platforms && _platforms.defaultPlatform) || 'girox';
            _entryPlat = (list.find((p) => p.id === def) || list[0]).id;
        }
        box.innerHTML = list.map((p) =>
            '<button type="button" class="ev-tab plat-' + _esc(p.id) + (p.id === _entryPlat ? ' active' : '') + '" onclick="VIP.home.entrySwitch(\'' + _esc(p.id) + '\')">' +
            (p.logoUrl ? '<img src="' + _esc(p.logoUrl) + '" alt="">' : '') + _esc(p.name) +
            (p.id === 'girox' ? '<span class="ev-reco">Recomendado</span>' : '') +
            '</button>').join('');
    }
    function entrySwitch(id) { _entryPlat = id; renderEntryTabs(); _entryLoad(); }
    function _entryStatus(text, showOpen) {
        const st = _el('entryStatus'); if (!st) return;
        if (text == null) { st.hidden = true; return; }
        st.hidden = false;
        const t = st.querySelector('.ev-st-t'); if (t) t.textContent = text;
        const b = st.querySelector('.ev-st-open'); if (b) b.style.display = showOpen ? '' : 'none';
    }
    function _entryLoad() {
        if (_homeMode !== 'play') return;
        const f = _el('entryFrame'); if (!f) return;
        const p = _entryList().find((x) => x.id === _entryPlat) || {};
        const url = p.playUrl || p.externalUrl || '';
        if (!url) { _entryStatus((p.name || 'Esa plataforma') + ' todavía no está disponible.', false); return; }
        if (url === _entryUrl && f.getAttribute('src') === url) return; // ya está abierta
        _entryUrl = url;
        _entryStatus('🎰 Abriendo ' + (p.name || 'la plataforma') + '…', false);
        f.src = url;
        clearTimeout(_entryTimer);
        // Si la web no deja embeberse (X-Frame-Options) nunca llega el 'load' → ofrecer abrirla aparte.
        _entryTimer = setTimeout(() => { const st = _el('entryStatus'); if (st && !st.hidden) _entryStatus((p.name || 'La plataforma') + ' no terminó de cargar acá adentro.', true); }, 15000);
    }
    function _entryUnload() {
        clearTimeout(_entryTimer);
        const f = _el('entryFrame');
        if (f && f.getAttribute('src') && f.getAttribute('src') !== 'about:blank') f.src = 'about:blank'; // libera la página del casino
        _entryUrl = '';
    }
    function _bindEntryFrame() {
        if (_entryBound) return;
        const f = _el('entryFrame'); if (!f) return;
        _entryBound = true;
        f.addEventListener('load', () => { if (_entryUrl && f.getAttribute('src') === _entryUrl) { clearTimeout(_entryTimer); _entryStatus(null); } });
    }
    function entryOpen() { openPlatform(_entryPlat || 'girox', { test: true }); }

    // #269: servicios del Inicio → mismos flujos de siempre.
    function svcRefund() {
        try { if (VIP.refunds && typeof VIP.refunds.showUnifiedRefundModal === 'function') return VIP.refunds.showUnifiedRefundModal(); } catch (_) {}
        const b = _el('weeklyRefundBtn'); if (b) b.click();
    }
    function svcRoulette() {
        try { if (VIP.roulette && typeof VIP.roulette.open === 'function') return VIP.roulette.open(); } catch (_) {}
        try { VIP.ui.showToast('La ruleta diaria se activa para clientes activos con la app instalada.', 'info'); } catch (_) {}
    }

    function _paintWaHeadName() {
        try {
            const n = _el('waHeadName'); if (!n || !_platforms || !Array.isArray(_platforms.platforms)) return;
            const d = _platforms.platforms.find((p) => p.id === _platforms.defaultPlatform) || _platforms.platforms[0];
            if (d && d.name) n.textContent = 'Cargas ' + d.name;
        } catch (_) {}
    }

    // ---------------- SOPORTE (chat) ----------------
    function openSupport() {
        // #267: desde la pantalla de entrada, el chat se abre como pantalla principal (modo mini).
        if (_homeMode === 'play') { setHomeMode('mini'); return; }
        const p = _el('supportPanel');
        if (!p) return;
        p.classList.remove('hidden');
        document.body.classList.add('support-open');
        try { const bb = _el('supportBubble'); if (bb) bb.style.visibility = 'hidden'; } catch (_) {}
        _open = true;
        _unread = 0;
        _paintBadge();
        try { VIP.chat.scrollToBottom(); } catch (_) {}
        try { VIP.chat.markReceivedAsRead(); } catch (_) {}
        setTimeout(() => { try { VIP.chat.scrollToBottom(); } catch (_) {} }, 120);
    }
    function closeSupport() {
        // #266: con el home plegado el chat ES la pantalla → "cerrar" = desplegar la app completa.
        if (_homeMode === 'mini') { setHomeMode('full'); return; }
        const p = _el('supportPanel');
        if (!p) return;
        p.classList.add('hidden');
        document.body.classList.remove('support-open');
        try { const bb = _el('supportBubble'); if (bb) bb.style.visibility = ''; } catch (_) {}
        _open = false;
        try { const i = _el('messageInput'); if (i) i.blur(); } catch (_) {}
    }
    function toggleSupport() { _open ? closeSupport() : openSupport(); }
    function isSupportOpen() { return _open; }

    function _paintBadge() {
        ['supportUnread', 'headerSupportUnread', 'navManualUnread'].forEach((id) => {
            const b = _el(id);
            if (!b) return;
            if (_unread > 0) { b.textContent = _unread > 99 ? '99+' : String(_unread); b.style.display = ''; }
            else b.style.display = 'none';
        });
    }
    // #243: sacar la burbuja → queda el círculo de soporte arriba, al lado del fueguito (sólo en la sesión).
    // #248: tocar el círculo de arriba vuelve a mostrar la burbuja movible (y la deja abierta al chat).
    // #268: ya no hay círculo "Soporte aquí" en la cabecera (el chat es "Carga manual" arriba);
    // #headerSupportBtn vive como fila del modal Perfil y no se toca.
    function restoreBubble() {
        const b = _el('supportBubble'); if (b) b.style.display = '';
        _paintBadge();
    }
    function dismissBubble(ev) {
        if (ev) { ev.preventDefault(); ev.stopPropagation(); }
        const b = _el('supportBubble'); if (b) b.style.display = 'none';
    }

    // Mensajes que llegan con el chat CERRADO → contador. La pregunta de
    // plataforma abre el chat sola (tiene botones que hay que tocar).
    function _onIncoming(message) {
        if (!message || message.senderRole === 'user') return;
        const md = message.metadata;
        if (md && md.kind === 'platform_choice' && !md.chosen) {
            if (!_open) openSupport();
            try { VIP.ui.showToast('💰 ¡Llegó tu transferencia! Elegí dónde querés jugar 👇', 'success'); } catch (_) {}
            return;
        }
        if (!_open) { _unread++; _paintBadge(); }
    }

    // ---------------- PRUEBAS DE PLATAFORMA (#235/#236): SIEMPRE dentro de la app ----------------
    // (owner: "esas páginas de prueba para jugar siempre adentro de la app, sin salir").
    // Plataforma con API → casino embebido con SSO (enterCasino). Sin API (Ganamos hoy) → su web
    // en el MISMO recuadro embebido (sin login automático hasta conectar la API).
    function _embedExternal(p) {
        const url = p && (p.playUrl || p.externalUrl);
        if (!url) { VIP.ui.showToast((p && p.name || 'Esa plataforma') + ' todavía no está disponible.', 'info'); return; }
        try {
            VIP.ui._casinoPlatform = p.id;
            VIP.ui._showCasinoFrame();
            VIP.ui._casinoOpen = true;
            const f = _el('casinoFrame');
            if (f) f.src = url; // el 'load' del iframe esconde "Entrando…" y muestra el recuadro
            clearTimeout(VIP.ui._casinoWatchdog);
            VIP.ui._casinoWatchdog = setTimeout(() => { if (VIP.ui._casinoOpen && VIP.ui._casinoFrameStuck) VIP.ui._casinoFrameStuck(); }, 15000);
            try { renderCasinoTabs(); } catch (_) {}
        } catch (e) { VIP.ui.showToast('No se pudo abrir ' + (p.name || ''), 'error'); }
    }
    // #245: modo PRUEBA (desde "Probá las plataformas" del soporte) = sólo la página de la plataforma,
    // SIN la burbuja/chat "Carga rápida" de adentro del casino (el owner: la página puede ponerse lenta).
    function _setCasinoTestMode(on) {
        try {
            const ov = _el('casinoOverlay');
            if (ov) ov.classList.toggle('casino-test', !!on);
            if (on) { try { if (VIP.ui._casinoChatUnmount) VIP.ui._casinoChatUnmount(); } catch (_) {} }
        } catch (_) {}
    }
    function openInApp(platformId, opts) {
        const test = !!(opts && opts.test);
        const list = (_platforms && _platforms.platforms) || [];
        const p = list.find(x => x.id === platformId) || { id: platformId, connected: platformId === 'girox', name: platformId };
        // #261: con la app instalada → adentro (sin carga rápida si es prueba); en navegador → aparte.
        openPlatform(p.id, { test });
    }
    function renderSupportTests() {
        const box = _el('supportTests');
        if (!box) return;
        const list = (_platforms && _platforms.platforms) || [];
        const items = list.filter(p => p.connected || p.playUrl || p.externalUrl);
        if (!items.length) { box.innerHTML = ''; return; }
        box.innerHTML = '<div class="st-head"><span class="st-label">Probá las plataformas</span><span class="st-note">Solo para mirar · sin salir de la app</span></div>' +
            '<div class="st-row">' + items.map(p =>
                '<button type="button" class="st-btn st-' + _esc(p.id) + '" onclick="VIP.home.openInApp(\'' + _esc(p.id) + '\', {test:true})">' +
                (p.logoUrl ? '<img class="st-logo" src="' + _esc(p.logoUrl) + '" alt="">' : '') +
                '<span>' + _esc(p.name) + '</span></button>').join('') + '</div>';
    }

    // ---------------- INFO DEL SERVICIO (#237): reseñas plegadas + niveles VIP ----------------
    // ---------------- REFERIDOS: cobro desde la app (#240) ----------------
    async function loadReferralClaimable() {
        const amt = _el('refClaimAmount'), btn = _el('refClaimBtn'), note = _el('refClaimNote');
        if (!amt || !btn) return;
        try {
            const r = await fetch(VIP.config.API_URL + '/api/referrals/claimable', { headers: { 'Authorization': 'Bearer ' + VIP.state.currentToken } });
            const j = await r.json().catch(() => ({}));
            const d = (j && j.data) || {};
            const av = Number(d.availableAmount) || 0, locked = Number(d.lockedEstimate) || 0;
            amt.textContent = '$' + Math.round(av).toLocaleString('es-AR');
            btn.disabled = av <= 0;
            if (note) note.textContent = av > 0
                ? 'Tocá "Cobrar" y entra a tu cuenta al instante.'
                : (locked > 0 ? ('Llevás $' + Math.round(locked).toLocaleString('es-AR') + ' este mes (' + (d.currentPeriodLabel || '') + '). Se desbloquea el ' + (d.unlocksAt || '1 del mes que viene') + '.')
                             : ('Lo que generen tus referidos este mes se desbloquea el ' + (d.unlocksAt || '1 del mes que viene') + '.'));
        } catch (_) { if (note) note.textContent = 'No pudimos leer tu comisión. Reintentá.'; }
    }
    async function claimReferral() {
        const btn = _el('refClaimBtn'); if (!btn || btn.disabled) return;
        btn.disabled = true; const t = btn.textContent; btn.textContent = 'Acreditando…';
        try {
            const r = await fetch(VIP.config.API_URL + '/api/referrals/claim', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + VIP.state.currentToken } });
            const j = await r.json().catch(() => ({}));
            if (!r.ok) { VIP.ui.showToast(j.error || (j.message) || 'No se pudo cobrar', 'error'); btn.disabled = false; btn.textContent = t; return; }
            const c = (j.data && j.data.creditedAmount) || 0;
            VIP.ui.showToast('¡Listo! Te acreditamos $' + Math.round(c).toLocaleString('es-AR') + ' de comisiones 🤝', 'success');
            try { if (VIP.ui.syncBalance) VIP.ui.syncBalance(); } catch (_) {}
            btn.textContent = t;
            loadReferralClaimable();
            try { if (VIP.ui.openReferralModal && VIP.ui._loadReferralData) VIP.ui._loadReferralData(); } catch (_) {}
        } catch (_) { VIP.ui.showToast('Error de conexión', 'error'); btn.disabled = false; btn.textContent = t; }
    }
    try {
        const _origRef = VIP.ui && VIP.ui.openReferralModal;
        if (typeof _origRef === 'function') {
            VIP.ui.openReferralModal = async function () { const r = await _origRef.apply(this, arguments); try { loadReferralClaimable(); } catch (_) {} return r; };
        }
    } catch (_) {}

    function toggleRefHow() {
        const body = _el('refHowBody'), ch = _el('refHowChevron');
        if (!body) return;
        const open = body.style.display === 'none';
        body.style.display = open ? '' : 'none';
        if (ch) ch.textContent = open ? '▲' : '▼';
    }
    function toggleInfoRoulette() {
        const body = _el('infoRouletteBody'), ch = _el('infoRouletteChevron');
        if (!body) return;
        const open = body.style.display === 'none';
        body.style.display = open ? '' : 'none';
        if (ch) ch.textContent = open ? '▲' : '▼';
    }
    function toggleInfoVip() {
        const body = _el('infoVipBody'), ch = _el('infoVipChevron');
        if (!body) return;
        const open = body.style.display === 'none';
        body.style.display = open ? '' : 'none';
        if (ch) ch.textContent = open ? '▲' : '▼';
        if (open) { try { renderVipDetail(); } catch (_) {} }
    }
    function toggleInfoReviews() {
        const body = _el('infoReviewsBody'), ch = _el('infoReviewsChevron');
        if (!body) return;
        const open = body.style.display === 'none';
        body.style.display = open ? '' : 'none';
        if (ch) ch.textContent = open ? '▲' : '▼';
    }
    function _ars(n) { return '$' + Math.round(Number(n) || 0).toLocaleString('es-AR'); }
    function _arsShort(n) {
        n = Number(n) || 0;
        if (n >= 1e9) return '$' + (n / 1e9).toLocaleString('es-AR', { maximumFractionDigits: 1 }) + ' mil M';
        if (n >= 1e6) return '$' + (n / 1e6).toLocaleString('es-AR', { maximumFractionDigits: 1 }) + ' M';
        return _ars(n);
    }
    function renderVipDetail() {
        const box = _el('infoVipDetail');
        if (!box) return;
        const v = VIP.state && VIP.state.vipStatus;
        if (!v || v.enabled === false || !Array.isArray(v.levels) || !v.levels.length) { box.innerHTML = ''; return; }
        const cur = v.level && v.level.idx;
        const rows = v.levels.map(l =>
            '<div class="vip-row vip-row-2' + (cur === l.idx ? ' is-cur' : '') + '">' +
            '<span class="vip-name" style="color:' + _esc(l.color || '#fff') + '">' + _esc(l.emoji || '') + ' ' + _esc(l.name) + '</span>' +
            '<span class="vip-rake">' + Number(l.rakebackPct).toLocaleString('es-AR') + '% rakeback</span>' +
            '</div>').join('');
        const pct = Math.round(Math.max(0, Math.min(100, Number(v.progressPct) || 0)));
        const mine = v.level
            ? ('Tu nivel: <b style="color:' + _esc(v.level.color || '#fff') + '">' + _esc(v.level.emoji + ' ' + v.level.name) + '</b>' + (v.next ? ' · <b>' + pct + '%</b> hacia ' + _esc(v.next.name) : ''))
            : (v.next ? 'Todavía sin nivel · <b>' + pct + '%</b> hacia ' + _esc(v.next.emoji + ' ' + v.next.name) : '');
        box.innerHTML =
            '<p class="info-vip-p">Todo lo que apostás suma <b>para siempre</b> (nunca bajás). Al llegar a cada nivel cobrás un <b>bono en el momento</b> y desde ahí un <b>rakeback semanal</b>: un % de todo lo que apostaste en la semana, <b>ganes o pierdas</b>, que reclamás desde tu perfil.</p>' +
            (mine ? '<p class="info-vip-mine">' + mine + '</p>' : '') +
            '<div class="vip-row vip-row-2 vip-row-h"><span>Nivel</span><span>Rakeback</span></div>' + rows;
    }
    // Cuando se abre "Información del servicio", refrescar el detalle VIP con lo último cargado.
    try { document.addEventListener('click', (e) => { if (e.target && e.target.closest && e.target.closest('#infoBtn')) setTimeout(renderVipDetail, 60); }, true); } catch (_) {}

    // ---------------- INSTALAR APP (#249): el botón dice qué va a pasar ----------------
    // Android con prompt nativo → "se instala con un toque"; iPhone / sin prompt → "te mostramos cómo";
    // ya instalada → "App instalada ✓" (y el botón se apaga).
    function paintInstallButtons() {
        const b = _el('homeInstallAppBtn');
        const ua = navigator.userAgent || '';
        const standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
        const isIOS = /iPhone|iPad|iPod/.test(ua) && !window.MSStream;
        const inApp = /Instagram|FBAN|FBAV|FB_IAB|FBIOS|TikTok|Line\/|Snapchat/i.test(ua);
        let small = 'Acceso directo y avisos';
        if (standalone) small = 'App instalada ✓';
        else if (window.deferredPrompt) small = 'Se instala con un toque';
        else if (isIOS) small = 'Te mostramos cómo (Safari)';
        else if (inApp) small = 'Te abrimos en Chrome para instalar';
        else small = 'Te mostramos cómo';
        if (b) {
            const sm = b.querySelector('small'); if (sm) sm.textContent = small;
            b.disabled = !!standalone; b.style.opacity = standalone ? '.55' : '';
        }
        const hl = document.querySelector('#headerInstallBtn .tb-circle-lbl'); if (hl) hl.textContent = standalone ? 'Instalada' : 'Instalar';
    }
    try {
        window.addEventListener('beforeinstallprompt', () => setTimeout(paintInstallButtons, 0));
        window.addEventListener('appinstalled', () => setTimeout(paintInstallButtons, 0));
    } catch (_) {}

    // ---------------- NIVEL VIP en el home (#253): barra + escalera desbloqueable ----------------
    function toggleVipCard() {
        const body = _el('vipCardBody'), ch = _el('vipChevron');
        if (!body) return;
        const open = body.style.display === 'none';
        body.style.display = open ? '' : 'none';
        if (ch) ch.textContent = open ? '▲' : '▼';
    }
    // #257: cartel "¡Felicidades por tu nuevo nivel!" con reclamo del bono eligiendo plataforma.
    let _vipClaimPlat = null;
    function renderVipClaim(v) {
        const box = _el('vipClaimCard');
        if (!box) return;
        const pend = (v && Array.isArray(v.pendingLevelBonuses)) ? v.pendingLevelBonuses : [];
        if (!pend.length) { box.style.display = 'none'; box.innerHTML = ''; return; }
        const plats = ((_platforms && _platforms.platforms) || []).filter(p => p.connected);
        if (!_vipClaimPlat || !plats.some(p => p.id === _vipClaimPlat)) _vipClaimPlat = (plats.find(p => p.id === ((_platforms && _platforms.preferredPlatform) || 'girox')) || plats[0] || { id: 'girox' }).id;
        box.style.display = '';
        box.innerHTML = pend.map(l =>
            '<div class="vc-item">' +
            '<div class="vc-title">🎉 ¡Felicidades! Llegaste a <b style="color:' + _esc(l.color || '#fff') + '">' + _esc(l.emoji + ' ' + l.name) + '</b></div>' +
            '<div class="vc-amt">Tenés un bono de <b>$' + Math.round(l.bonusArs).toLocaleString('es-AR') + '</b> para reclamar</div>' +
            (plats.length > 1 ? '<div class="vc-plats">' + plats.map(p => '<button type="button" class="vc-plat' + (p.id === _vipClaimPlat ? ' on' : '') + '" onclick="VIP.home.pickVipClaimPlat(\'' + _esc(p.id) + '\')">' + _esc(p.name) + '</button>').join('') + '</div>' : '') +
            '<button type="button" class="vc-btn" onclick="VIP.home.claimLevelBonus(' + Number(l.idx) + ', this)">Reclamar en ' + _esc((plats.find(p => p.id === _vipClaimPlat) || { name: 'Girox' }).name) + '</button>' +
            '</div>').join('');
    }
    function pickVipClaimPlat(id) { _vipClaimPlat = id; renderVipClaim(VIP.state && VIP.state.vipStatus); }
    async function claimLevelBonus(idx, btn) {
        if (btn) { btn.disabled = true; btn.textContent = 'Acreditando…'; }
        try {
            const r = await fetch(VIP.config.API_URL + '/api/vip/level-bonus/claim', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + VIP.state.currentToken }, body: JSON.stringify({ idx, platform: _vipClaimPlat }) });
            const d = await r.json().catch(() => ({}));
            if (!r.ok) { VIP.ui.showToast(d.error || 'No se pudo reclamar', 'error'); if (btn) { btn.disabled = false; btn.textContent = 'Reclamar'; } return; }
            VIP.ui.showToast('🎉 ¡Listo! $' + Math.round(d.amount).toLocaleString('es-AR') + ' acreditados en ' + (d.label || ''), 'success');
            try { if (VIP.ui.syncBalance) VIP.ui.syncBalance(); } catch (_) {}
            try { if (VIP.refunds && VIP.refunds.loadVipStatus) await VIP.refunds.loadVipStatus(); } catch (_) {}
            renderVipClaim(VIP.state && VIP.state.vipStatus);
        } catch (_) { VIP.ui.showToast('Error de conexión', 'error'); if (btn) { btn.disabled = false; btn.textContent = 'Reclamar'; } }
    }
    function renderVipCard() {
        const card = _el('vipCard');
        if (!card) return;
        const v = VIP.state && VIP.state.vipStatus;
        try { renderVipClaim(v); } catch (_) {}
        if (!v || v.enabled === false || !Array.isArray(v.levels) || !v.levels.length) { card.style.display = 'none'; return; }
        card.style.display = '';
        const curIdx = Number(v.levelIndex) || (v.level && v.level.idx) || 0;
        const pct = Math.max(0, Math.min(100, Number(v.progressPct) || 0));
        const lvl = _el('vipHeadLvl'), nx = _el('vipHeadNext'), pc = _el('vipHeadPct'), fill = _el('vipBarFill');
        if (lvl) lvl.innerHTML = v.level ? ('<b style="color:' + _esc(v.level.color || '#fff') + '">' + _esc(v.level.emoji + ' ' + v.level.name) + '</b>') : 'Nivel VIP <b>— sin nivel aún</b>';
        if (nx) nx.textContent = v.next ? ('próximo nivel: ' + v.next.name) : 'nivel máximo alcanzado';
        if (pc) pc.textContent = v.next ? (Math.round(pct) + '%') : '100%';
        if (fill) { fill.style.width = (v.next ? pct : 100) + '%'; if (v.next && v.next.color) fill.style.background = 'linear-gradient(90deg, ' + (v.level && v.level.color || '#ff2d55') + ', ' + v.next.color + ')'; }
        const body = _el('vipCardBody');
        if (body) {
            // #256 (owner): sin plata a la vista — sólo niveles y porcentajes (los montos son internos).
            body.innerHTML = '<p class="vip-body-p">Cuanto más jugás, más subís. Cada nivel que alcanzás se <b>desbloquea</b> con su bono y su <b>rakeback semanal</b> (% de lo que apostás, ganes o pierdas).</p>' +
                v.levels.map(l => {
                    const reached = l.idx <= curIdx;
                    const isNext = v.next && l.idx === v.next.idx;
                    return '<div class="vip-lvl vip-lvl-3' + (reached ? ' on' : '') + (isNext ? ' next' : '') + '">' +
                        '<span class="vip-lvl-st">' + (reached ? '✓' : '🔒') + '</span>' +
                        '<span class="vip-lvl-name" style="color:' + _esc(l.color || '#fff') + '">' + _esc(l.emoji + ' ' + l.name) + (isNext ? ' <small>próximo</small>' : '') + '</span>' +
                        '<span class="vip-lvl-win">' + Number(l.rakebackPct).toLocaleString('es-AR') + '% rakeback</span>' +
                        '</div>';
                }).join('');
        }
    }
    try {
        const _origVip = VIP.refunds && VIP.refunds.loadVipStatus;
        if (typeof _origVip === 'function') {
            VIP.refunds.loadVipStatus = async function () { const r = await _origVip.apply(this, arguments); try { renderVipCard(); renderVipDetail(); } catch (_) {} return r; };
        }
    } catch (_) {}

    // ---------------- GUARDÁ TU ACCESO (#233): plegable ----------------
    function toggleAccess() {
        const body = _el('accessBody'), ch = _el('accessChevron');
        if (!body) return;
        const open = body.style.display === 'none';
        body.style.display = open ? '' : 'none';
        if (ch) ch.textContent = open ? '▲' : '▼';
        if (open) { try { VIP.autoload.init(); } catch (_) {} }
    }

    // ---------------- BURBUJA DE SOPORTE (#229) ----------------
    // Arranca ABIERTA (expandida) en cada entrada; el cliente la puede minimizar a un círculo
    // (sólo durante la sesión) y arrastrarla por la pantalla. Tocarla abre el chat.
    let _bubbleMin = false;
    function toggleBubble(ev) {
        if (ev) { ev.preventDefault(); ev.stopPropagation(); }
        const b = _el('supportBubble');
        if (!b) return;
        _bubbleMin = !_bubbleMin;
        b.classList.toggle('expanded', !_bubbleMin);
        b.classList.toggle('minimized', _bubbleMin);
        const m = b.querySelector('.sb-min');
        if (m) m.textContent = _bubbleMin ? '+' : '–';
    }
    function _initBubbleDrag() {
        const b = _el('supportBubble');
        if (!b || b.dataset.dragReady) return;
        b.dataset.dragReady = '1';
        let sx = 0, sy = 0, ox = 0, oy = 0, moved = false, dragging = false;
        const onDown = (e) => {
            const p = e.touches ? e.touches[0] : e;
            dragging = true; moved = false; sx = p.clientX; sy = p.clientY;
            const r = b.getBoundingClientRect(); ox = r.left; oy = r.top;
        };
        const onMove = (e) => {
            if (!dragging) return;
            const p = e.touches ? e.touches[0] : e;
            const dx = p.clientX - sx, dy = p.clientY - sy;
            if (!moved && Math.abs(dx) + Math.abs(dy) < 6) return;
            moved = true;
            const w = b.offsetWidth, hgt = b.offsetHeight;
            const nx = Math.min(window.innerWidth - w - 4, Math.max(4, ox + dx));
            const ny = Math.min(window.innerHeight - hgt - 4, Math.max(4, oy + dy));
            b.style.left = nx + 'px'; b.style.top = ny + 'px'; b.style.right = 'auto'; b.style.bottom = 'auto';
            if (e.cancelable) e.preventDefault();
        };
        const onUp = () => {
            if (!dragging) return;
            dragging = false;
            if (moved) { b.dataset.justDragged = '1'; setTimeout(() => { delete b.dataset.justDragged; }, 250); }
        };
        b.addEventListener('touchstart', onDown, { passive: true });
        b.addEventListener('touchmove', onMove, { passive: false });
        b.addEventListener('touchend', onUp);
        b.addEventListener('mousedown', onDown);
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        // Un arrastre no debe abrir el chat.
        b.addEventListener('click', (e) => { if (b.dataset.justDragged) { e.stopPropagation(); e.preventDefault(); } }, true);
    }

    // ---------------- PLATAFORMAS ----------------
    async function loadPlatforms(force) {
        if (!force && _platforms && (Date.now() - _platformsAt) < 60000) return _platforms;
        if (!VIP.state || !VIP.state.currentToken) return null;
        try {
            const r = await fetch(VIP.config.API_URL + '/api/platforms', { headers: { 'Authorization': 'Bearer ' + VIP.state.currentToken } });
            if (!r.ok) return _platforms;
            _platforms = await r.json();
            _platformsAt = Date.now();
        } catch (_) {}
        return _platforms;
    }

    // #230 (owner): "¿dónde querés jugar? Ganamos o Girox, que la gente elija y después vea el CBU".
    // Tocar la tarjeta = ELEGIR (queda fija: las cargas van ahí). "Entrar ›" abre la plataforma
    // dentro de la app con la sesión iniciada.
    function _platBtn(p, preferred) {
        const label = _esc(p.name);
        const isPref = preferred === p.id;
        const onSelect = "VIP.home.choosePlatform('" + _esc(p.id) + "')";
        const onEnter = "event.stopPropagation();VIP.home.playOn('" + _esc(p.id) + "')";
        const logo = p.logoUrl ? '<img class="plat-logo" src="' + _esc(p.logoUrl) + '" alt="">' : '';
        return '<div class="plat-play-wrap' + (isPref ? ' is-pref' : '') + '">' +
            '<button type="button" class="plat-play-btn plat-' + _esc(p.id) + (isPref ? ' is-pref' : '') + '" onclick="' + onSelect + '">' +
            '<span class="plat-check">' + (isPref ? '✓' : '') + '</span>' +
            // #255 (owner): Girox lleva un "Recomendado" chiquito en rojo dentro del recuadro.
            (p.id === 'girox' ? '<span class="plat-reco">Recomendado</span>' : '') +
            logo +
            '<span class="plat-play-name">' + label + '</span>' +
            '<span class="plat-play-sub">' + (isPref ? 'Elegida · tus cargas van acá' : 'Tocá para elegir') + '</span>' +
            '<span class="plat-enter" onclick="' + onEnter + '">' + (p.connected ? 'Entrar ›' : 'Abrir ›') + '</span>' +
            '</button></div>';
    }
    function choosePlatform(platformId) {
        const cur = (_platforms && _platforms.preferredPlatform) || null;
        if (cur === platformId) { playOn(platformId); return; } // ya elegida → entrar
        setPreferred(platformId);
    }

    async function setPreferred(platformId) {
        try {
            const r = await fetch(VIP.config.API_URL + '/api/platforms/preferred', {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + VIP.state.currentToken },
                body: JSON.stringify({ platform: platformId })
            });
            const d = await r.json().catch(() => ({}));
            if (!r.ok) { VIP.ui.showToast(d.error || 'No se pudo guardar', 'error'); return; }
            if (_platforms) _platforms.preferredPlatform = d.preferredPlatform || null;
            renderPlatforms();
            VIP.ui.showToast(d.preferredPlatform ? ('Listo: tus cargas van directo a ' + (d.label || '')) : 'Listo: te preguntamos dónde jugar en cada carga', 'success');
        } catch (_) { VIP.ui.showToast('Error de conexión', 'error'); }
    }

    function renderPlatforms() {
        const box = _el('platformsButtons');
        if (!box) return;
        const list = (_platforms && _platforms.platforms) || [];
        const pref = (_platforms && _platforms.preferredPlatform) || null;
        if (!list.length) {
            // Sin respuesta del server (o backend viejo): girox como siempre.
            box.innerHTML = _platBtn({ id: 'girox', name: 'Girox', emoji: '🎰', connected: true, isDefault: true }, null);
        } else {
            box.innerHTML = list.map(p => _platBtn(p, list.length >= 2 ? pref : null)).join('');
        }
        try { renderSupportTests(); } catch (_) {}
        const sub = _el('platformsSub');
        if (sub) {
            const prefP = list.find(p => p.id === pref);
            sub.textContent = list.length >= 2
                ? (prefP ? ('Elegiste ' + prefP.name + ' · ahora transferí al CBU de abajo 👇')
                         : ('Tocá una para elegir · después transferí al CBU de abajo'))
                : 'Tocá para entrar con tu sesión iniciada.';
        }
    }

    // #260 (owner): el casino se abre APARTE, en una pestaña propia con nuestra barra "‹ Volver a la
    // app" arriba (/jugar.html) y el casino ocupando el resto. La pestaña se abre PRIMERO (dentro del
    // gesto del usuario, si no el bloqueador de pop-ups la mata) y recién después se pide el link de
    // login único por API (un solo uso, 60 s). Sin API (Ganamos) → su web. test:true → la home pública.
    async function openPlatformTab(platformId, opts) {
        const test = !!(opts && opts.test);
        const list = (_platforms && _platforms.platforms) || [];
        const p = list.find(x => x.id === platformId) || { id: platformId, name: platformId, connected: platformId === 'girox', playUrl: null, externalUrl: null };
        let win = null;
        try {
            win = window.open('', '_blank');
            if (win && win.document) win.document.write('<!doctype html><meta charset="utf-8"><title>Entrando…</title><body style="margin:0;display:flex;align-items:center;justify-content:center;height:100vh;background:#06070d;color:#ff6b6b;font-family:system-ui,sans-serif;font-size:18px;font-weight:800">🎰 Entrando a ' + _esc(p.name) + '…</body>');
        } catch (_) { win = null; }
        let url = null, err = null;
        try {
            if (test || !p.connected) {
                url = p.playUrl || p.externalUrl || null;
                if (!url) err = (p.name || 'Esa plataforma') + ' todavía no está disponible.';
            } else {
                VIP.ui._casinoPlatform = p.id;
                let r = await VIP.ui._fetchCasinoSession(20000);
                if (!r.ok && r.retryable) { await new Promise(res => setTimeout(res, 1500)); r = await VIP.ui._fetchCasinoSession(20000); }
                if (r.ok) url = r.url; else err = r.error || 'No pudimos abrirte el casino. Intentá de nuevo.';
            }
        } catch (_) { err = 'Sin conexión. Intentá de nuevo.'; }
        if (!url) { try { if (win && !win.closed) win.close(); } catch (_) {} VIP.ui.showToast(err || 'No se pudo abrir', 'error'); return; }
        const wrapper = '/jugar.html?p=' + encodeURIComponent(p.id) + '&n=' + encodeURIComponent(p.name || 'Casino') + '&app=' + encodeURIComponent(location.origin + '/') + '#u=' + encodeURIComponent(url);
        if (win && !win.closed) win.location.href = wrapper;
        else location.href = wrapper; // pop-up bloqueado → misma pestaña ("Volver" trae de vuelta)
    }

    // #261 (owner): APARTE sólo para quien NO tiene la app (navegador, así no pierde el acceso);
    // con la app instalada (standalone) el casino va ADENTRO (más rápido, al cerrar vuelve al home).
    function _isStandalone() {
        try { return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true; } catch (_) { return false; }
    }
    function openPlatform(platformId, opts) {
        const test = !!(opts && opts.test);
        if (!_isStandalone()) return openPlatformTab(platformId, { test });
        const list = (_platforms && _platforms.platforms) || [];
        const p = list.find(x => x.id === platformId) || { id: platformId, name: platformId, connected: platformId === 'girox' };
        if (test) _embedExternal({ id: p.id, name: p.name, playUrl: p.playUrl || p.externalUrl, externalUrl: p.externalUrl });
        else if (p.connected) { try { VIP.ui.enterCasino(p.id); } catch (_) {} }
        else _embedExternal(p);
        _setCasinoTestMode(test);
        setTimeout(() => { _setCasinoTestMode(test); _setupCasinoQuick(); }, 60);
    }
    function playOn(platformId) { openPlatform(platformId); }

    // ---- Carga rápida DENTRO del casino (#261): formato CARGA (no chat), descartable como el soporte ----
    let _quickDismissed = false, _quickOpen = false;
    function _setupCasinoQuick() {
        const ov = _el('casinoOverlay');
        if (!ov) return;
        // El botón flotante de siempre ahora abre nuestro panel de carga (no el chat).
        try { VIP.ui.toggleCasinoChat = function () { toggleCasinoLoad(); }; } catch (_) {}
        const bubble = _el('casinoSupportBubble');
        if (bubble && !bubble.dataset.quickReady) {
            bubble.dataset.quickReady = '1';
            const x = document.createElement('button');
            x.type = 'button'; x.className = 'cq-x'; x.textContent = '✕'; x.title = 'Sacar (queda arriba)';
            x.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); dismissCasinoQuick(); });
            bubble.appendChild(x);
        }
        // Botón en la barra de arriba para traerlo de vuelta
        const bar = _el('casinoTopBar');
        if (bar && !_el('casinoQuickBtn')) {
            const row = bar.querySelector('.casino-topbar-row');
            if (row) row.insertAdjacentHTML('beforeend', '<button type="button" id="casinoQuickBtn" class="casino-quick-btn" style="display:none" onclick="VIP.home.restoreCasinoQuick()">💳 Carga rápida</button>');
        }
        if (bubble) bubble.style.display = _quickDismissed ? 'none' : '';
        const qb = _el('casinoQuickBtn'); if (qb) qb.style.display = _quickDismissed ? '' : 'none';
    }
    function dismissCasinoQuick() {
        _quickDismissed = true; _quickOpen = false;
        const b = _el('casinoSupportBubble'); if (b) b.style.display = 'none';
        const p = _el('casinoLoadPanel'); if (p) p.style.display = 'none';
        const qb = _el('casinoQuickBtn'); if (qb) qb.style.display = '';
    }
    function restoreCasinoQuick() {
        _quickDismissed = false;
        const b = _el('casinoSupportBubble'); if (b) b.style.display = '';
        const qb = _el('casinoQuickBtn'); if (qb) qb.style.display = 'none';
        toggleCasinoLoad(true);
    }
    function toggleCasinoLoad(force) {
        const ov = _el('casinoOverlay'); if (!ov) return;
        let p = _el('casinoLoadPanel');
        if (!p) {
            ov.insertAdjacentHTML('beforeend', '<div id="casinoLoadPanel" class="casino-load" style="display:none"></div>');
            p = _el('casinoLoadPanel');
        }
        _quickOpen = typeof force === 'boolean' ? force : !_quickOpen;
        if (!_quickOpen) { p.style.display = 'none'; return; }
        const cbu = (VIP.autoload && VIP.autoload.getCbu && VIP.autoload.getCbu()) || null;
        const list = (_platforms && _platforms.platforms) || [];
        const pref = (_platforms && _platforms.preferredPlatform) || null;
        p.innerHTML =
            '<div class="cl-head"><span>💳 Carga automática</span><button type="button" class="cl-close" onclick="VIP.home.toggleCasinoLoad(false)">✕</button></div>' +
            '<div class="cl-step"><b>1</b><div><div class="cl-t">Transferí a este CBU</div>' +
            '<div class="cl-cbu"><span class="mono">' + _esc(cbu && cbu.number ? cbu.number : 'cargando…') + '</span>' +
            (cbu && cbu.number ? '<button type="button" class="cl-copy" onclick="VIP.ui.copyText(\'' + _esc(cbu.number) + '\')">Copiar</button>' : '') + '</div>' +
            (cbu ? '<div class="cl-meta">' + _esc(cbu.bank || '') + ' · ' + _esc(cbu.titular || '') + '</div>' : '') + '</div></div>' +
            (list.length >= 2 ? '<div class="cl-step"><b>2</b><div><div class="cl-t">¿Dónde querés el saldo?</div><div class="cl-plats">' +
                list.map(x => '<button type="button" class="cl-plat' + (x.id === pref ? ' on' : '') + '" onclick="VIP.home.setPreferred(\'' + _esc(x.id) + '\');setTimeout(function(){VIP.home.toggleCasinoLoad(true)},400)">' + _esc(x.name) + '</button>').join('') + '</div></div></div>' : '') +
            '<button type="button" class="cl-btn" onclick="VIP.autoload.sendReceipt()">📎 Cargar aquí · adjuntar comprobante</button>' +
            '<div class="cl-meta" style="text-align:center">Se carga automáticamente · <a href="#" onclick="event.preventDefault();VIP.ui.closeCasinoFrame();">volver a la app</a></div>';
        p.style.display = '';
    }
    function _playOnEmbedded(platformId) {
        const list = (_platforms && _platforms.platforms) || [];
        const p = list.find(x => x.id === platformId) || { id: platformId, connected: platformId === 'girox', externalUrl: null, name: platformId };
        if (p.connected) {
            try { VIP.ui.enterCasino(p.id); } catch (e) { VIP.ui.showToast('No se pudo abrir el casino', 'error'); }
            return;
        }
        // #236: sin API también se abre DENTRO de la app (recuadro embebido), nunca afuera.
        _embedExternal(p);
    }

    // ---------------- CASINO: barra superior con las plataformas (#222) ----------------
    // El owner: "cuando entra, en una barra superior que diga 'elegí cuál plataforma jugar',
    // y una vez que cargan y entran con saldo, que aparezca ahí 'volver al menú de cargas'".
    // Se inyecta en el overlay del casino (VIP.ui._showCasinoFrame) sin tocar su HTML.
    function renderCasinoTabs() {
        const overlay = _el('casinoOverlay');
        if (!overlay) return;
        let bar = _el('casinoTopBar');
        if (!bar) {
            overlay.insertAdjacentHTML('afterbegin',
                '<div id="casinoTopBar" class="casino-topbar">' +
                  '<div class="casino-topbar-row">' +
                    '<button type="button" class="casino-back" onclick="VIP.ui.closeCasinoFrame()">‹ Volver al menú de cargas</button>' +
                    '<span class="casino-topbar-title">Elegí en cuál plataforma jugar</span>' +
                  '</div>' +
                  '<div id="casinoPlatTabs" class="casino-plat-tabs"></div>' +
                '</div>');
            bar = _el('casinoTopBar');
        }
        const tabs = _el('casinoPlatTabs');
        if (!tabs) return;
        const list = (_platforms && _platforms.platforms) || [{ id: 'girox', name: 'Girox', connected: true }];
        const current = (VIP.ui && VIP.ui._casinoPlatform) || 'girox';
        tabs.innerHTML = list.map(p =>
            '<button type="button" class="casino-plat-tab' + (p.id === current ? ' active' : '') + '" onclick="VIP.home.switchPlatform(\'' + _esc(p.id) + '\')">' +
            _esc(p.name) + (p.connected ? '' : ' <small>link</small>') + '</button>'
        ).join('');
    }
    function switchPlatform(platformId) {
        openPlatform(platformId);
    }
    try {
        const _origShowFrame = VIP.ui && VIP.ui._showCasinoFrame;
        if (typeof _origShowFrame === 'function') {
            VIP.ui._showCasinoFrame = function () {
                const r = _origShowFrame.apply(this, arguments);
                try { renderCasinoTabs(); } catch (_) {}
                return r;
            };
        }
    } catch (_) {}

    // Botón "llave" de la cabecera (#222): cambiar la contraseña.
    function openChangePassword() {
        try { VIP.ui.hideModal('settingsModal'); } catch (_) {}
        VIP.state.passwordChangePending = false;
        try { if (VIP.auth && typeof VIP.auth.prepareChangePasswordModal === 'function') VIP.auth.prepareChangePasswordModal(); } catch (_) {}
        VIP.ui.showModal('changePasswordModal');
    }

    // ---------------- CÓMO FUNCIONA ----------------
    function _money(n) { return '$' + Math.round(Number(n) || 0).toLocaleString('es-AR'); }
    function _ladderText(tiers) {
        return (tiers || []).map((t) => {
            const rango = t.max == null
                ? 'más de ' + _money(t.min)
                : (t.min === 0 ? 'hasta ' + _money(t.max) : _money(t.min) + ' a ' + _money(t.max));
            return rango + ' → <b>' + t.pct + '%</b>';
        }).join(' · ');
    }

    function renderHowItWorks() {
        const ref = _el('hiwRefunds');
        const s = VIP.state && VIP.state.refundStatus;
        // Modal "Información del servicio" (#228): % máximos reales de semanal y mensual.
        try {
            if (s && (s.tiersByPeriod || s.tiers)) {
                const tbp = s.tiersByPeriod || { weekly: s.tiers, monthly: s.tiers };
                const mx = (ts) => (ts || []).reduce((m, t) => (t && t.pct > m ? t.pct : m), 0);
                const w = _el('infoWeeklyMax'), m = _el('infoMonthlyMax');
                if (w && mx(tbp.weekly)) w.textContent = mx(tbp.weekly);
                if (m && mx(tbp.monthly)) m.textContent = mx(tbp.monthly);
                // #269: tarjeta "Reembolso" del Inicio — % máximo real entre semanal y mensual.
                const top = Math.max(mx(tbp.weekly), mx(tbp.monthly));
                const sv = _el('evSvcRefund'); if (sv && top) sv.textContent = 'hasta ' + top + '% de lo que perdés';
            }
        } catch (_) {}
        if (ref) {
            if (s && (s.tiersByPeriod || s.tiers)) {
                const tbp = s.tiersByPeriod || { weekly: s.tiers, monthly: s.tiers };
                const same = JSON.stringify(tbp.weekly) === JSON.stringify(tbp.monthly);
                let maxPct = 0;
                [tbp.weekly, tbp.monthly].forEach(ts => (ts || []).forEach(t => { if (t && t.pct > maxPct) maxPct = t.pct; }));
                ref.innerHTML =
                    '<b>🎁 Reembolsos de hasta ' + maxPct + '%</b> sobre lo que perdés con tu plata (los bonos no cuentan): ' +
                    '<b>semanal</b> se reclama lunes y martes, <b>mensual</b> desde el día 7. ' +
                    (same
                        ? '<span class="hiw-ladder">' + _ladderText(tbp.weekly) + '</span>'
                        : '<span class="hiw-ladder">🗓️ Semanal: ' + _ladderText(tbp.weekly) + '<br>📆 Mensual: ' + _ladderText(tbp.monthly) + '</span>') +
                    ' Se cobran solos desde el recuadro de arriba.';
            } else {
                ref.innerHTML = '<b>🎁 Reembolsos</b> semanales (lunes y martes) y mensuales (desde el día 7) según lo que perdiste con tu plata. Se reclaman solos desde el recuadro de arriba.';
            }
        }
        const pl = _el('hiwPlatforms');
        if (pl) {
            const list = (_platforms && _platforms.platforms) || [];
            if (list.length >= 2) {
                pl.innerHTML = '<b>🎮 Tenés ' + list.length + ' plataformas para jugar:</b> ' +
                    list.map(p => '<b>' + _esc((p.emoji || '') + ' ' + p.name) + '</b>').join(' y ') +
                    '. Cuando llega tu transferencia te preguntamos en cuál querés el saldo. Si no elegís, va a la última que usaste.';
            } else {
                pl.innerHTML = '<b>🎮 Jugás en</b> ' + _esc(list[0] ? (list[0].emoji + ' ' + list[0].name) : '🎰 Girox') + ': la carga entra sola en tu cuenta.';
            }
        }
    }

    function toggleHow() {
        const body = _el('hiwBody');
        const btn = _el('hiwToggle');
        if (!body) return;
        const hidden = body.style.display === 'none';
        body.style.display = hidden ? '' : 'none';
        if (btn) btn.textContent = hidden ? 'Ocultar ▲' : 'Ver ▼';
    }

    // ---------------- INIT ----------------
    let _inited = false;
    async function init() {
        // #266: primero el modo (chat principal / app completa) para que el primer paint ya sea el correcto.
        try { _initHomeMode(); } catch (_) {}
        // El panel viejo colapsable ("Ocultar menú") ya no aplica: el home es la carga.
        try {
            const hp = _el('homePanel'); if (hp) { hp.classList.remove('collapsed'); hp.style.maxHeight = 'none'; }
            const tg = _el('homePanelToggle'); if (tg) tg.style.display = 'none';
        } catch (_) {}
        // "Cómo funciona" vive arriba PLEGADO (#221): quien quiere leerlo lo abre; la
        // explicación completa además le llega por el chat (/sys_como_funciona).
        _inited = true;
        try { if (VIP.autoload) VIP.autoload.init(); } catch (_) {}
        try { _initBubbleDrag(); } catch (_) {}
        try { paintInstallButtons(); setTimeout(paintInstallButtons, 2500); } catch (_) {}
        await loadPlatforms(true);
        renderPlatforms();
        // #266: cartel "servicio completo" + nombre de la cabecera WhatsApp ("Cargas <plataforma default>").
        try { if (_platforms && _platforms.homeBanner) { _paintHomeBanner(_platforms.homeBanner); localStorage.setItem(HOME_BANNER_KEY, JSON.stringify(_platforms.homeBanner)); } } catch (_) {}
        _paintWaHeadName();
        try { renderEntryTabs(); _entryLoad(); } catch (_) {} // #267: lista real de plataformas en la entrada
        renderHowItWorks();
        try { renderVipDetail(); renderVipCard(); setTimeout(() => { renderVipDetail(); renderVipCard(); }, 4000); } catch (_) {}
    }

    // Enganches (una sola vez, al cargar el script):
    // 1) al mostrar la pantalla principal (login / sesión restaurada) → init.
    try {
        const _origShow = VIP.ui && VIP.ui.showChatScreen;
        if (typeof _origShow === 'function') {
            VIP.ui.showChatScreen = function () {
                const r = _origShow.apply(this, arguments);
                try { init(); } catch (_) {}
                return r;
            };
            window.showChatScreen = VIP.ui.showChatScreen;
        }
    } catch (_) {}
    // 2) escalera de reembolsos cargada → refrescar el resumen.
    try {
        const _origUpd = VIP.refunds && VIP.refunds.updateRefundButtons;
        if (typeof _origUpd === 'function') {
            VIP.refunds.updateRefundButtons = function () {
                const r = _origUpd.apply(this, arguments);
                try { renderHowItWorks(); } catch (_) {}
                return r;
            };
        }
    } catch (_) {}
    // 3) mensajes nuevos → contador / abrir el chat si hay que elegir plataforma.
    try {
        const _origAdd = VIP.chat && VIP.chat.addMessageToChat;
        if (typeof _origAdd === 'function') {
            VIP.chat.addMessageToChat = function (message) {
                const r = _origAdd.apply(this, arguments);
                try { _onIncoming(message); } catch (_) {}
                return r;
            };
        }
    } catch (_) {}

    VIP.home = { init, openSupport, closeSupport, toggleSupport, isSupportOpen, loadPlatforms, getHomeMode, setHomeMode, toggleHomeMode, syncWaHead: _mirrorHeadBits, renderEntryTabs, entrySwitch, entryOpen, openProfile, profileTogglePw, profileCopy, svcRefund, svcRoulette, renderPlatforms, playOn, renderHowItWorks, toggleHow,
        renderCasinoTabs, switchPlatform, openChangePassword, setPreferred, toggleBubble, dismissBubble, restoreBubble, choosePlatform, paintInstallButtons, openPlatformTab, openPlatform, toggleCasinoLoad, dismissCasinoQuick, restoreCasinoQuick, toggleAccess, openInApp, renderSupportTests, toggleInfoReviews, toggleInfoVip, toggleInfoRoulette, renderVipDetail, toggleRefHow, toggleVipCard, renderVipCard, renderVipClaim, pickVipClaimPlat, claimLevelBonus, loadReferralClaimable, claimReferral,
        get platformsData() { return _platforms; } };
})();
