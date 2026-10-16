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

    // ---------------- SOPORTE (chat) ----------------
    function openSupport() {
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
        ['supportUnread', 'headerSupportUnread'].forEach((id) => {
            const b = _el(id);
            if (!b) return;
            if (_unread > 0) { b.textContent = _unread > 99 ? '99+' : String(_unread); b.style.display = ''; }
            else b.style.display = 'none';
        });
    }
    // #243: sacar la burbuja → queda el círculo de soporte arriba, al lado del fueguito (sólo en la sesión).
    // #248: tocar el círculo de arriba vuelve a mostrar la burbuja movible (y la deja abierta al chat).
    function restoreBubble() {
        const b = _el('supportBubble'); if (b) b.style.display = '';
        const h = _el('headerSupportBtn'); if (h) h.style.display = 'none';
        _paintBadge();
    }
    function dismissBubble(ev) {
        if (ev) { ev.preventDefault(); ev.stopPropagation(); }
        const b = _el('supportBubble'); if (b) b.style.display = 'none';
        const h = _el('headerSupportBtn'); if (h) h.style.display = '';
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
        if (test) {
            // #246 (owner): "que entre a la página principal de cada casino" → la home pública de la
            // plataforma (playUrl / link externo), sin login único.
            _embedExternal({ id: p.id, name: p.name, playUrl: p.playUrl || p.externalUrl, externalUrl: p.externalUrl });
        } else if (p.connected) { try { VIP.ui.enterCasino(p.id); } catch (_) {} }
        else _embedExternal(p);
        _setCasinoTestMode(test);
        setTimeout(() => _setCasinoTestMode(test), 50); // por si el overlay se creó recién
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
            '<div class="vip-row' + (cur === l.idx ? ' is-cur' : '') + '">' +
            '<span class="vip-name" style="color:' + _esc(l.color || '#fff') + '">' + _esc(l.emoji || '') + ' ' + _esc(l.name) + '</span>' +
            '<span class="vip-th">' + _arsShort(l.thresholdArs) + ' jugados</span>' +
            '<span class="vip-bonus">+' + _arsShort(l.levelUpBonusArs) + '</span>' +
            '<span class="vip-rake">' + Number(l.rakebackPct).toLocaleString('es-AR') + '% sem.</span>' +
            '</div>').join('');
        const mine = v.level
            ? ('Tu nivel: <b style="color:' + _esc(v.level.color || '#fff') + '">' + _esc(v.level.emoji + ' ' + v.level.name) + '</b>' + (v.next ? ' · te faltan <b>' + _ars(v.faltaParaSubir) + '</b> jugados para ' + _esc(v.next.name) : ''))
            : (v.next ? 'Todavía sin nivel: con <b>' + _arsShort(v.next.thresholdArs) + '</b> jugados llegás a ' + _esc(v.next.emoji + ' ' + v.next.name) + ' y cobrás <b>' + _arsShort(v.next.levelUpBonusArs) + '</b>.' : '');
        box.innerHTML =
            '<p class="info-vip-p">Todo lo que apostás suma <b>para siempre</b> (nunca bajás). Al llegar a cada nivel cobrás un <b>bono en el momento</b> y desde ahí un <b>rakeback semanal</b>: un % de todo lo que apostaste en la semana, <b>ganes o pierdas</b>, que reclamás desde tu perfil.</p>' +
            (mine ? '<p class="info-vip-mine">' + mine + '</p>' : '') +
            '<div class="vip-row vip-row-h"><span>Nivel</span><span>Llegás con</span><span>Bono</span><span>Rakeback</span></div>' + rows;
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
    function renderVipCard() {
        const card = _el('vipCard');
        if (!card) return;
        const v = VIP.state && VIP.state.vipStatus;
        if (!v || v.enabled === false || !Array.isArray(v.levels) || !v.levels.length) { card.style.display = 'none'; return; }
        card.style.display = '';
        const curIdx = Number(v.levelIndex) || (v.level && v.level.idx) || 0;
        const pct = Math.max(0, Math.min(100, Number(v.progressPct) || 0));
        const lvl = _el('vipHeadLvl'), nx = _el('vipHeadNext'), pc = _el('vipHeadPct'), fill = _el('vipBarFill');
        if (lvl) lvl.innerHTML = v.level ? ('<b style="color:' + _esc(v.level.color || '#fff') + '">' + _esc(v.level.emoji + ' ' + v.level.name) + '</b>') : 'Nivel VIP <b>— sin nivel aún</b>';
        if (nx) nx.textContent = v.next ? ('te faltan ' + _ars(v.faltaParaSubir) + ' jugados para ' + v.next.name) : 'nivel máximo alcanzado';
        if (pc) pc.textContent = v.next ? (Math.round(pct) + '%') : '100%';
        if (fill) { fill.style.width = (v.next ? pct : 100) + '%'; if (v.next && v.next.color) fill.style.background = 'linear-gradient(90deg, ' + (v.level && v.level.color || '#ff2d55') + ', ' + v.next.color + ')'; }
        const body = _el('vipCardBody');
        if (body) {
            body.innerHTML = '<p class="vip-body-p">Todo lo que apostás suma para siempre. Al llegar a cada nivel se <b>desbloquea</b> su bono (se acredita solo) y su rakeback semanal.</p>' +
                v.levels.map(l => {
                    const reached = l.idx <= curIdx;
                    const isNext = v.next && l.idx === v.next.idx;
                    return '<div class="vip-lvl' + (reached ? ' on' : '') + (isNext ? ' next' : '') + '">' +
                        '<span class="vip-lvl-st">' + (reached ? '✓' : '🔒') + '</span>' +
                        '<span class="vip-lvl-name" style="color:' + _esc(l.color || '#fff') + '">' + _esc(l.emoji + ' ' + l.name) + '</span>' +
                        '<span class="vip-lvl-th">' + _arsShort(l.thresholdArs) + ' jugados</span>' +
                        '<span class="vip-lvl-win">+' + _arsShort(l.levelUpBonusArs) + ' · ' + Number(l.rakebackPct).toLocaleString('es-AR') + '% sem.</span>' +
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
                ? (prefP ? ('Elegiste ' + prefP.name + ': tus cargas van ahí. Ahora transferí al CBU de abajo 👇')
                         : ('Elegí ' + list.map(p => p.name).join(' o ') + '. Después mandá tu transferencia al CBU de abajo.'))
                : 'Tocá para entrar con tu sesión iniciada.';
        }
    }

    // Entrar a una plataforma: con API → SSO embebido de siempre; sin API → su link.
    function playOn(platformId) {
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
        const list = (_platforms && _platforms.platforms) || [];
        const p = list.find(x => x.id === platformId) || { id: platformId, connected: platformId === 'girox' };
        if (p.connected) {
            if ((VIP.ui._casinoPlatform || 'girox') === p.id && VIP.ui._casinoOpen) return; // ya está
            try { VIP.ui.enterCasino(p.id); } catch (_) {}
            return;
        }
        playOn(platformId);
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

    VIP.home = { init, openSupport, closeSupport, toggleSupport, isSupportOpen, loadPlatforms, renderPlatforms, playOn, renderHowItWorks, toggleHow,
        renderCasinoTabs, switchPlatform, openChangePassword, setPreferred, toggleBubble, dismissBubble, restoreBubble, choosePlatform, paintInstallButtons, toggleAccess, openInApp, renderSupportTests, toggleInfoReviews, toggleInfoVip, toggleInfoRoulette, renderVipDetail, toggleRefHow, toggleVipCard, renderVipCard, loadReferralClaimable, claimReferral,
        get platformsData() { return _platforms; } };
})();
