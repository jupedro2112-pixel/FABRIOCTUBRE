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
        const b = _el('supportUnread');
        if (!b) return;
        if (_unread > 0) { b.textContent = _unread > 99 ? '99+' : String(_unread); b.style.display = ''; }
        else b.style.display = 'none';
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
        return '<div class="plat-play-wrap' + (isPref ? ' is-pref' : '') + '">' +
            '<button type="button" class="plat-play-btn' + (isPref ? ' is-pref' : '') + '" onclick="' + onSelect + '">' +
            '<span class="plat-check">' + (isPref ? '✓' : '') + '</span>' +
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
        if (p.externalUrl) {
            // Dentro del gesto del usuario → el bloqueador de pop-ups lo deja pasar.
            const w = window.open(p.externalUrl, '_blank', 'noopener');
            if (!w) location.href = p.externalUrl;
            return;
        }
        VIP.ui.showToast((p.name || 'Esa plataforma') + ' todavía no está disponible. Escribinos por soporte.', 'info');
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
        await loadPlatforms(true);
        renderPlatforms();
        renderHowItWorks();
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
        renderCasinoTabs, switchPlatform, openChangePassword, setPreferred, toggleBubble, choosePlatform,
        get platformsData() { return _platforms; } };
})();
