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
    function _countdown() {
        const box = $('rfCount'); if (!box || !_d) return;
        const ms = new Date(_d.closesAt).getTime() - Date.now();
        if (ms <= 0) { box.innerHTML = '<b>Cerrado</b><small>Los ganadores se publican el ' + esc(fdate(_d.announceAt, true)) + ' h</small>'; return; }
        const d = Math.floor(ms / 86400000), h = Math.floor(ms / 3600000) % 24, m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60;
        const cell = (v, l) => '<span><b>' + String(v).padStart(2, '0') + '</b><small>' + l + '</small></span>';
        box.innerHTML = cell(d, 'días') + cell(h, 'horas') + cell(m, 'min') + cell(s, 'seg');
    }
    function _prizes(list, soon) {
        return '<div class="rf-prizes">' + (list || []).map((p, i) => '<div class="rf-prize rf-p' + (i + 1) + '"><em>' + MEDAL[i] + ' ' + (i + 1) + '° puesto</em><b>' + esc(p.title) + '</b><small>' + esc(p.detail || '') + '</small></div>').join('') + '</div>' +
            (soon ? '' : '<p class="rf-cash">Todos los premios se pueden cobrar en <b>efectivo</b> si el ganador lo prefiere.</p>');
    }
    function _render() {
        const m = $('rfMain'); if (!m) return;
        if (!_d) { m.innerHTML = '<div class="rf-note">Cargando el sorteo…</div>'; return; }
        const me = _d.me || {}; const pos = me.position;
        const upd = _d.updatedAt ? 'Actualizado ' + fdate(_d.updatedAt, true) + ' h · se recalcula cada 20 minutos' : 'Los puntos se actualizan cada 20 minutos';
        const win = _d.myWin;
        m.innerHTML =
            '<section class="rf-hero"><img src="/images/sorteo/' + _brand + '-active.svg" alt="Sorteo mensual: auto 0 km, iPhone 18 Pro Max y $500.000"></section>' +
            '<section class="rf-card rf-cd"><small>Cierra el ' + esc(fdate(_d.closesAt, true)) + ' h · ' + esc(_d.monthLabel) + '</small><div class="rf-count" id="rfCount"></div></section>' +
            (win ? '<section class="rf-card rf-win"><b>🎉 ¡Ganaste el sorteo de ' + esc(win.monthLabel) + '!</b><p>Puesto ' + win.pos + ' · <b>' + esc(win.prize) + '</b></p>' +
                (win.delivered ? '<p class="rf-ok">✅ Premio entregado.</p>' : '<p>' + (win.contactAt ? 'Ya nos escribiste: el Soporte de entrega de premios te está contactando.' : 'Escribile a nuestro Soporte exclusivo de entrega de premios para coordinar la entrega.') + '</p><button type="button" class="rf-btn" onclick="VIP.raffle.contact()">🏆 Coordinar la entrega</button>') + '</section>' : '') +
            '<section class="rf-card rf-me"><div class="rf-me-h"><span>Tu posición</span><b>' + (pos ? pos + '°' : '—') + '</b></div>' +
            '<div class="rf-stats"><div><small>Puntos</small><b>' + num(me.points) + '</b></div><div><small>Apostado válido</small><b>' + money(me.validWagered) + '</b></div></div>' +
            (pos === 1 ? '<p class="rf-lead">🥇 ¡Vas primero! Seguí sumando para no perder el puesto.</p>' : (pos ? '<p class="rf-lead">Te faltan <b>' + num(me.toFirst) + ' puntos</b> (≈ ' + money(me.toFirst * 1000) + ' apostados) para el 1° puesto' + (me.toPodium > 0 ? ' y <b>' + num(me.toPodium) + '</b> para entrar al podio' : '') + '.</p>' : '<p class="rf-lead">Todavía no sumaste puntos este mes. Con una carga y tus jugadas entrás al ranking: <b>cada $100.000 apostados = 100 puntos</b>.</p>')) +
            '<details class="rf-calc"><summary>¿Cómo se calcula lo mío?</summary><div>' +
            '<p>Apostado en el mes: <b>' + money(me.wagered) + '</b></p><p>Tus cargas reales del mes: <b>' + money(me.deposits) + '</b> · Bonos recibidos: <b>' + money(me.bonusGranted) + '</b></p>' +
            '<p>Sólo cuenta lo apostado con plata real: <b>' + money(me.wagered) + ' × ' + money(me.deposits) + ' ÷ ' + money((me.deposits || 0) + (me.bonusGranted || 0)) + ' = ' + money(me.validWagered) + '</b> ⇒ <b>' + num(me.points) + ' puntos</b>.</p></div></details>' +
            '<small class="rf-upd">' + esc(upd) + '</small></section>' +
            '<section class="rf-sec"><h3>🎁 Premios de ' + esc(_d.monthLabel) + '</h3>' + _prizes(_d.prizes) + '</section>' +
            '<section class="rf-sec"><h3>📊 Ranking del mes <small>' + num(_d.participants) + ' participando</small></h3>' +
            ((_d.top || []).length ? '<ol class="rf-rank">' + _d.top.map((t) => '<li class="' + (t.me ? 'me' : '') + (t.pos <= 3 ? ' top' : '') + '"><span class="rf-pos">' + (t.pos <= 3 ? MEDAL[t.pos - 1] : t.pos + '°') + '</span><span class="rf-name">' + esc(t.name) + (t.me ? ' (vos)' : '') + '</span><b>' + num(t.points) + ' pts</b></li>').join('') + '</ol>' : '<div class="rf-note">Todavía nadie sumó puntos este mes. ¡Sé el primero!</div>') +
            '<small class="rf-upd">Los nombres se muestran tapados para cuidar la privacidad de cada jugador.</small></section>' +
            (_d.lastWinners ? '<section class="rf-sec"><h3>🏅 Ganadores de ' + esc(_d.lastWinners.monthLabel) + '</h3><ol class="rf-rank">' + _d.lastWinners.winners.map((w) => '<li class="top"><span class="rf-pos">' + MEDAL[w.pos - 1] + '</span><span class="rf-name">' + esc(w.name) + ' · ' + esc(w.prize) + '</span><b>' + (w.delivered ? '✅ Entregado' : 'En entrega') + '</b></li>').join('') + '</ol></section>' : '') +
            '<section class="rf-sec rf-support"><h3>🤝 Soporte exclusivo de entrega de premios</h3><p>Cuando ganás, te escribimos por la app y también podés escribirnos vos con el botón <b>“Coordinar la entrega”</b> que aparece arriba en esta pantalla. Una persona del equipo te acompaña hasta que tengas tu premio: verificamos tu identidad, acordamos día y lugar (o la transferencia si elegís efectivo) y te confirmamos cada paso.</p></section>' +
            '<section class="rf-sec"><h3>📜 Bases y condiciones</h3><ul class="rf-rules">' +
            '<li><b>Quiénes participan:</b> clientes registrados en la app de PICA ROJA que hagan al menos una carga real en el mes. Se juega en PICA ROJA, JUGAYGANA, Ganamos o Girox: es la misma cuenta y todo suma.</li>' +
            '<li><b>Cómo se suman puntos:</b> cada $100.000 apostados con plata real = 100 puntos (1 punto cada $1.000). Los datos salen de la plataforma de juego, del 1° al último día del mes.</li>' +
            '<li><b>Los bonos no suman:</b> sólo cuenta lo apostado con tu plata. La plataforma informa el total apostado y los bonos recibidos; por eso se toma la parte proporcional a tus cargas reales (ej.: si cargaste $100.000 y recibiste $50.000 de bono, cuenta 2/3 de lo apostado).</li>' +
            '<li><b>Hasta cuándo suma:</b> hasta el ' + esc(fdate(_d.closesAt, true)) + ' h (hora argentina). Lo que se juegue después suma para el mes siguiente.</li>' +
            '<li><b>Ganadores:</b> los 3 primeros del ranking. Se publican el ' + esc(fdate(_d.announceAt, true)) + ' h en el menú completo de la app, con los nombres tapados. Empate: gana quien tenga más apostado válido y, si sigue igual, quien llegó antes a ese puntaje.</li>' +
            '<li><b>Entrega:</b> dentro de los ' + num(_d.deliveryBusinessDays) + ' días hábiles siguientes a la publicación, coordinada por el Soporte exclusivo de entrega de premios. El premio se entrega al titular de la cuenta, presentando su DNI.' + (_d.cashOption ? ' Cada premio puede cobrarse en efectivo por su valor.' : '') + '</li>' +
            '<li><b>Transparencia:</b> cada jugador ve sus puntos, su apostado válido y su puesto en todo momento. Una persona = una cuenta: las cuentas duplicadas o con jugadas irregulares quedan fuera.</li>' +
            '</ul></section>' +
            '<section class="rf-sec rf-soon"><h3>🚀 Próximamente · ' + esc((_d.upcoming && _d.upcoming.title) || 'Gran Sorteo') + '</h3><div class="rf-hero"><img src="/images/sorteo/' + _brand + '-upcoming.svg" alt="Gran Sorteo próximamente"></div>' + _prizes(_d.upcoming && _d.upcoming.prizes, true) + '<p class="rf-cash">Muy pronto vas a poder participar. Te avisamos apenas arranque. Los premios también se podrán cobrar en efectivo.</p></section>';
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
        clearInterval(_timer); _timer = setInterval(_countdown, 1000);
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
            const t = d.myWin && !d.myWin.delivered ? '🎉 ¡Ganaste el ' + d.myWin.pos + '° puesto! Tocá para coordinar la entrega' : (me.position ? 'Vas ' + me.position + '° · ' + num(me.points) + ' pts' + (me.position > 1 ? ' · te faltan ' + num(me.toFirst) + ' para el 1°' : ' · ¡vas primero!') : 'Sumá puntos jugando: cada $100.000 = 100 pts');
            document.querySelectorAll('.js-rf-pos').forEach((e) => { e.textContent = t; });
        } catch (_) {}
    }
    try { setTimeout(function loop() { paintEntries(); setTimeout(loop, 60 * 1000); }, 4000); } catch (_) {}
    return { open, close, contact, paintEntries };
})();
