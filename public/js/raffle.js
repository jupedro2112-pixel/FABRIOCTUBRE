// ========================================
// #917 (owner 2026-10-23): SORTEO MENSUAL — pantalla del cliente (GET /api/raffle). Transparente: su puesto, sus puntos, lo apostado válido
// del mes (con la cuenta explicada), cuánto le falta para el 1° y para el podio, el ranking con los nombres tapados, los premios, las bases
// (quién participa, hasta cuándo suma, cuándo se publica y cómo se entrega), los últimos ganadores y el SOPORTE DE ENTREGA DE PREMIOS.
// Toma el estilo de la marca desde donde se abre (PICA ROJA / JUGAYGANA / Ganamos). Más abajo, el Gran Sorteo "Próximamente".
// ========================================
window.VIP = window.VIP || {};
VIP.raffle = (function () {
    const $ = (id) => document.getElementById(id);
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const money = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-AR');
    const num = (n) => Math.round(Number(n) || 0).toLocaleString('es-AR');
    const fdate = (iso, withTime) => { try { return new Date(iso).toLocaleString('es-AR', Object.assign({ timeZone: 'America/Argentina/Buenos_Aires', day: 'numeric', month: 'long' }, withTime ? { hour: '2-digit', minute: '2-digit' } : {})); } catch (_) { return ''; } };
    const MEDAL = ['🥇', '🥈', '🥉'];
    let _d = null, _brand = 'picaroja', _timer = null;

    function _shell() {
        let el = $('rfPage');
        if (!el) {
            document.body.insertAdjacentHTML('beforeend', '<div id="rfPage" class="rf" hidden role="dialog" aria-label="Sorteo mensual"><header class="rf-top"><button type="button" class="rf-back" onclick="VIP.raffle.close()">‹ Volver</button><b>🏆 Sorteo mensual</b><span></span></header><main class="rf-main" id="rfMain"></main></div>');
            el = $('rfPage');
        }
        el.className = 'rf rf-' + _brand;
        return el;
    }
    // #919 (owner): trofeos dibujados (oro, plata, bronce) — también los usa la tira de arriba de las páginas.
    const TRO = { 1: ['#ffd76a', '#c9971c'], 2: ['#e9edf3', '#9aa3ad'], 3: ['#f0b27a', '#a8642c'] };
    const trophy = (n) => '<svg class="rf-tro-svg" viewBox="-52 -50 104 100" aria-hidden="true"><path d="M-30 -44 H30 V-14 C30 6 16 20 0 22 C-16 20 -30 6 -30 -14 Z" fill="' + TRO[n][0] + '" stroke="' + TRO[n][1] + '" stroke-width="3"/><path d="M-30 -36 C-50 -36 -50 -8 -28 -4 M30 -36 C50 -36 50 -8 28 -4" fill="none" stroke="' + TRO[n][1] + '" stroke-width="5"/><rect x="-6" y="22" width="12" height="14" fill="' + TRO[n][1] + '"/><rect x="-22" y="36" width="44" height="10" rx="3" fill="' + TRO[n][0] + '" stroke="' + TRO[n][1] + '" stroke-width="2"/><text x="0" y="-6" text-anchor="middle" font-family="Arial" font-size="30" font-weight="900" fill="' + TRO[n][1] + '">' + n + '</text></svg>';
    const DEF = {
        prizes: [{ title: 'iPhone 18 Pro Max', detail: 'Nuevo, en caja sellada' }, { title: 'Orden de compra $1.000.000', detail: 'Para usar en supermercado' }, { title: '$500.000 para jugar', detail: 'En la plataforma que quieras' }],
        upcoming: { title: 'Gran Sorteo', prizes: [{ title: 'Auto 0 km', detail: 'Valorado en $30.000.000' }, { title: 'Viaje al Caribe para 2', detail: 'Todo incluido · 5 días' }, { title: 'USD 2.000', detail: 'En efectivo' }] }
    };
    function _left(iso) { const ms = Math.max(0, new Date(iso).getTime() - Date.now()); return { d: Math.floor(ms / 86400000), h: Math.floor(ms / 3600000) % 24, m: Math.floor(ms / 60000) % 60, s: Math.floor(ms / 1000) % 60, ms }; }
    function _countdown() {
        document.querySelectorAll('.js-rf-count').forEach((box) => {
            const target = box.dataset.to; if (!target) return; const t = _left(target);
            const cell = (v, l) => '<span><b>' + String(v).padStart(2, '0') + '</b><small>' + l + '</small></span>';
            box.innerHTML = t.ms <= 0 ? '<span class="rf-done">¡Ya empezó!</span>' : cell(t.d, 'días') + cell(t.h, 'hs') + cell(t.m, 'min') + cell(t.s, 'seg');
        });
    }
    function _trophies(list) {
        return '<div class="rf-tros">' + [0, 1, 2].map((i) => { const p = (list || [])[i] || {}; return '<div class="rf-tro rf-tro' + (i + 1) + '">' + trophy(i + 1) + '<b>' + esc(p.title || '') + '</b><small>' + esc(p.detail || '') + '</small></div>'; }).join('') + '</div>';
    }
    // Recuadro compacto (arriba de las páginas y en el Inicio): título, cuenta regresiva y los 3 trofeos.
    function stripHtml(brand) {
        const d = _d || {}; const ns = d.notStarted !== false; const to = ns ? (d.startsAt || '2026-11-01T03:00:00.000Z') : d.closesAt;
        return '<div class="rf-strip rf-sb-' + esc(brand || 'picaroja') + '">' +
            '<button type="button" class="rf-box" onclick="VIP.raffle.open(\'' + esc(brand || '') + '\')"><div class="rf-box-h"><b>🏆 Sorteo mensual</b><span>' + (ns ? 'Empieza en' : 'Termina en') + '</span></div><div class="rf-count js-rf-count" data-to="' + esc(to || '') + '"></div>' + _trophies(d.prizes || DEF.prizes) + '<em class="rf-box-go">Ver ranking ›</em></button>' +
            '<button type="button" class="rf-box rf-box-soon" onclick="VIP.raffle.open(\'' + esc(brand || '') + '\')"><div class="rf-box-h"><b>🚀 ' + esc((d.upcoming && d.upcoming.title) || DEF.upcoming.title) + '</b><span>Próximamente</span></div>' + _trophies((d.upcoming && d.upcoming.prizes) || DEF.upcoming.prizes) + '</button></div>';
    }
    function _render() {
        const m = $('rfMain'); if (!m) return;
        if (!_d) { m.innerHTML = '<div class="rf-note">Cargando el sorteo…</div>'; return; }
        const me = _d.me || {}; const pos = me.position; const ns = !!_d.notStarted; const win = _d.myWin;
        m.innerHTML =
            '<section class="rf-box rf-box-big"><div class="rf-box-h"><b>' + (ns ? 'Empieza el 1 de ' + esc(_d.monthLabel.split(' ')[0]) : 'Termina el ' + esc(fdate(_d.closesAt, true)) + ' h') + '</b><span>' + (ns ? 'Faltan' : 'Quedan') + '</span></div><div class="rf-count js-rf-count" data-to="' + esc(ns ? _d.startsAt : _d.closesAt) + '"></div>' + _trophies(_d.prizes) + '</section>' +
            (win ? '<section class="rf-card rf-win"><b>🎉 ¡Ganaste el ' + win.pos + '° puesto de ' + esc(win.monthLabel) + '!</b><p>' + esc(win.prize) + '</p>' + (win.delivered ? '<p class="rf-ok">✅ Premio entregado.</p>' : '<button type="button" class="rf-btn" onclick="VIP.raffle.contact()">🏆 Coordinar la entrega</button>') + '</section>' : '') +
            (!ns ? '<section class="rf-mine">' + (pos ? '<b>' + pos + '°</b><span>' + num(me.points) + ' pts' + (pos > 1 ? ' · te faltan <b>' + num(me.toFirst) + '</b> para el 1°' : ' · ¡vas primero!') + '</span>' : '<span>Todavía no sumaste puntos este mes · cada $100.000 apostados = 100 pts</span>') + '</section>' : '') +
            '<section class="rf-sec"><h3>📊 Ranking' + (ns ? '' : ' <small>' + num(_d.participants) + ' participando</small>') + '</h3>' +
            (ns ? '<div class="rf-note">El ranking arranca el 1 de ' + esc(_d.monthLabel.split(' ')[0]) + '. Cada $100.000 apostados = 100 puntos.</div>' :
                ((_d.top || []).length ? '<ol class="rf-rank">' + _d.top.map((t) => '<li class="' + (t.me ? 'me' : '') + (t.pos <= 3 ? ' top' : '') + '"><span class="rf-pos">' + (t.pos <= 3 ? trophy(t.pos) : t.pos + '°') + '</span><span class="rf-name">' + esc(t.name) + (t.me ? ' (vos)' : '') + '</span><b>' + num(t.points) + ' pts</b></li>').join('') + '</ol>' : '<div class="rf-note">Todavía nadie sumó puntos. ¡Sé el primero!</div>')) + '</section>' +
            '<section class="rf-box rf-box-soon"><div class="rf-box-h"><b>🚀 ' + esc((_d.upcoming && _d.upcoming.title) || 'Gran Sorteo') + '</b><span>Próximamente</span></div>' + _trophies(_d.upcoming && _d.upcoming.prizes) + '</section>' +
            '<details class="rf-bases"><summary>📜 Bases y condiciones</summary><ul class="rf-rules">' +
            '<li><b>Empieza:</b> el 1 de noviembre de 2026. Lo jugado antes no suma.</li>' +
            '<li><b>Participan:</b> clientes registrados en la app de PICA ROJA con al menos una carga real en el mes. Suma lo jugado en PICA ROJA, JUGAYGANA, Ganamos o Girox (misma cuenta).</li>' +
            '<li><b>Puntos:</b> cada $100.000 apostados con plata real = 100 puntos. Los bonos no suman: se toma la parte de lo apostado proporcional a tus cargas reales del mes (ej.: cargaste $100.000 y recibiste $50.000 de bono ⇒ cuenta 2/3 de lo apostado).' + (!ns && me.wagered ? ' Lo tuyo: ' + money(me.wagered) + ' apostado × ' + money(me.deposits) + ' ÷ ' + money((me.deposits || 0) + (me.bonusGranted || 0)) + ' = ' + money(me.validWagered) + ' ⇒ ' + num(me.points) + ' pts.' : '') + '</li>' +
            '<li><b>Hasta cuándo suma:</b> hasta el ' + esc(fdate(_d.closesAt, true)) + ' h (hora argentina). Se actualiza cada 20 minutos.</li>' +
            '<li><b>Ganadores:</b> los 3 primeros del ranking, publicados el ' + esc(fdate(_d.announceAt, true)) + ' h en el menú completo, con nombres tapados. Empate: más apostado válido; si sigue igual, quien llegó antes.</li>' +
            '<li><b>Entrega:</b> dentro de los ' + num(_d.deliveryBusinessDays) + ' días hábiles, con nuestro Soporte exclusivo de entrega de premios, al titular de la cuenta con su DNI.' + (_d.cashOption ? ' Cada premio puede cobrarse en efectivo.' : '') + '</li>' +
            '<li><b>Transparencia:</b> cada jugador ve su puesto y sus puntos en todo momento. Una persona = una cuenta; las cuentas duplicadas o con jugadas irregulares quedan fuera.</li>' +
            (_d.lastWinners ? '<li><b>Últimos ganadores (' + esc(_d.lastWinners.monthLabel) + '):</b> ' + _d.lastWinners.winners.map((w) => w.pos + '° ' + esc(w.name) + ' · ' + esc(w.prize) + (w.delivered ? ' ✅' : '')).join(' · ') + '</li>' : '') +
            '</ul></details>';
        _countdown();
    }
    async function _load() {
        try {
            const r = await fetch(VIP.config.API_URL + '/api/raffle', { headers: { Authorization: 'Bearer ' + ((VIP.state && VIP.state.currentToken) || '') } });
            const d = await r.json().catch(() => ({}));
            if (r.ok) { _d = d; _render(); } else { const m = $('rfMain'); if (m) m.innerHTML = '<div class="rf-note">' + esc(d.error || 'No pudimos cargar el sorteo. Probá de nuevo.') + '</div>'; }
        } catch (_) { const m = $('rfMain'); if (m) m.innerHTML = '<div class="rf-note">Sin conexión. Probá de nuevo.</div>'; }
    }
    function open(brand) {
        _brand = ['picaroja', 'jugaygana', 'ganamos'].includes(brand) ? brand : ((VIP.lobby && VIP.lobby.skin && VIP.lobby.skin()) || 'picaroja');
        if (!['picaroja', 'jugaygana', 'ganamos'].includes(_brand)) _brand = 'picaroja';
        const el = _shell(); el.hidden = false; document.body.classList.add('rf-open'); _render(); _load();
        _countdown();
    }
    function close() { const el = $('rfPage'); if (el) el.hidden = true; document.body.classList.remove('rf-open'); clearInterval(_timer); }
    async function contact() {
        try {
            const r = await fetch(VIP.config.API_URL + '/api/raffle/contact', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + VIP.state.currentToken }, body: '{}' });
            const d = await r.json().catch(() => ({}));
            if (!r.ok) { try { VIP.ui.showToast(d.error || 'No se pudo enviar', 'error'); } catch (_) {} return; }
            try { VIP.ui.showToast('✅ Listo: el Soporte de entrega de premios ya tiene tu mensaje.', 'success'); } catch (_) {}
            close(); try { if (VIP.lobby) VIP.lobby.close(); } catch (_) {} try { VIP.home.setHomeMode('mini'); } catch (_) {}
        } catch (_) { try { VIP.ui.showToast('Sin conexión. Probá de nuevo.', 'error'); } catch (__) {} }
    }
    // Botón del Inicio: "Vas 4° · 500 pts · te faltan 2.501 para el 1°" (se refresca cada 10 min, sólo con sesión).
    let _entAt = 0;
    async function paintEntries() {
        if (!(VIP.state && VIP.state.currentToken) || Date.now() - _entAt < 10 * 60 * 1000) return; _entAt = Date.now();
        try {
            const r = await fetch(VIP.config.API_URL + '/api/raffle', { headers: { Authorization: 'Bearer ' + VIP.state.currentToken } }); if (!r.ok) return;
            const d = await r.json(); _d = _d || d; const me = d.me || {};
            const lf = _left(d.startsAt); const t = d.notStarted ? 'Empieza en ' + lf.d + ' días y ' + lf.h + ' h · iPhone 18 Pro Max y más' : d.myWin && !d.myWin.delivered ? '🎉 ¡Ganaste el ' + d.myWin.pos + '° puesto! Tocá para coordinar la entrega' : (me.position ? 'Vas ' + me.position + '° · ' + num(me.points) + ' pts' + (me.position > 1 ? ' · te faltan ' + num(me.toFirst) + ' para el 1°' : ' · ¡vas primero!') : 'Sumá puntos jugando: cada $100.000 = 100 pts');
            document.querySelectorAll('.js-rf-pos').forEach((e) => { e.textContent = t; });
        } catch (_) {}
    }
    try { setTimeout(function loop() { paintEntries(); setTimeout(loop, 60 * 1000); }, 4000); } catch (_) {}
    try { setInterval(() => { if (document.querySelector('.js-rf-count')) _countdown(); }, 1000); } catch (_) {} // cuentas regresivas visibles (páginas, Inicio, sorteo)
    return { open, close, contact, paintEntries, stripHtml, tick: _countdown };
})();
