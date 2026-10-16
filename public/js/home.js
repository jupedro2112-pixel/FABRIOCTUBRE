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

    function _platBtn(p) {
        const label = _esc((p.emoji || '🎮') + ' ' + p.name);
        const sub = p.connected ? 'Entrar y jugar' : 'Abrir ' + _esc(p.name);
        const onclick = "VIP.home.playOn('" + _esc(p.id) + "')";
        return '<button type="button" class="plat-play-btn' + (p.isDefault ? ' is-default' : '') + '" onclick="' + onclick + '">' +
            '<span class="plat-play-name">' + label + '</span>' +
            '<span class="plat-play-sub">' + sub + '</span>' +
            '</button>';
    }

    function renderPlatforms() {
        const box = _el('platformsButtons');
        if (!box) return;
        const list = (_platforms && _platforms.platforms) || [];
        if (!list.length) {
            // Sin respuesta del server (o backend viejo): girox como siempre.
            box.innerHTML = _platBtn({ id: 'girox', name: 'Girox', emoji: '🎰', connected: true, isDefault: true });
        } else {
            box.innerHTML = list.map(_platBtn).join('');
        }
        const sub = _el('platformsSub');
        if (sub) {
            sub.textContent = list.length >= 2
                ? 'Tenés ' + list.length + ' plataformas para jugar. Después de cargar te preguntamos en cuál querés tu saldo.'
                : 'Después de cargar, entrá a jugar desde acá.';
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
        if (btn) btn.textContent = hidden ? 'Ocultar ▲' : 'Ver cómo funciona ▼';
        try { localStorage.setItem('vip_hiw_collapsed', hidden ? '0' : '1'); } catch (_) {}
    }

    // ---------------- INIT ----------------
    let _inited = false;
    async function init() {
        // El panel viejo colapsable ("Ocultar menú") ya no aplica: el home es la carga.
        try {
            const hp = _el('homePanel'); if (hp) { hp.classList.remove('collapsed'); hp.style.maxHeight = 'none'; }
            const tg = _el('homePanelToggle'); if (tg) tg.style.display = 'none';
        } catch (_) {}
        if (!_inited) {
            _inited = true;
            // "Cómo funciona" arranca ABIERTO (el owner quiere que se explique al entrar);
            // si el cliente lo cerró una vez, se respeta.
            try {
                if (localStorage.getItem('vip_hiw_collapsed') === '1') {
                    const body = _el('hiwBody'); const btn = _el('hiwToggle');
                    if (body) body.style.display = 'none';
                    if (btn) btn.textContent = 'Ver cómo funciona ▼';
                }
            } catch (_) {}
        }
        try { if (VIP.autoload) VIP.autoload.init(); } catch (_) {}
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
        get platformsData() { return _platforms; } };
})();
