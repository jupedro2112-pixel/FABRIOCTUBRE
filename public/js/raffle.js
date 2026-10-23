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
    // #920: fotos premium de cada premio (ilustraciones propias) con el trofeo del puesto encima.
    const IMG = { active: ['iphone', 'orden', 'fichas'], upcoming: ['auto', 'viaje', 'usd'] };
    function _trophies(list, kind) {
        const im = IMG[kind || 'active'];
        return '<div class="rf-tros">' + [0, 1, 2].map((i) => { const p = (list || [])[i] || {}; return '<div class="rf-tro rf-tro' + (i + 1) + '"><span class="rf-tro-pic"><img src="/images/sorteo/premios/' + im[i] + '.svg" alt="" loading="lazy">' + trophy(i + 1) + '</span><b>' + esc(p.title || '') + '</b><small>' + esc(p.detail || '') + '</small></div>'; }).join('') + '</div>';
    }
    // #920 (owner): el recuadro arranca ABIERTO y se puede minimizar; minimizado muestra el puesto del jugador (o cuánto falta para empezar).
    const MIN_KEY = 'vip_rf_min';
    // #922 (owner): la PRIMERA vez se ve abierto; después arranca minimizado ("Ver más" lo abre). Lo que toque vale en esta sesión.
    function _minState(key) {
        try { const v = sessionStorage.getItem(key); if (v === '1' || v === '0') return v === '1'; } catch (_) {}
        try { const seen = localStorage.getItem(key + '_seen') === '1'; if (!seen) { localStorage.setItem(key + '_seen', '1'); try { sessionStorage.setItem(key, '0'); } catch (_) {} return false; } } catch (_) { return false; }
        return true;
    }
    function _setMin(key, v) { try { sessionStorage.setItem(key, v ? '1' : '0'); } catch (_) {} }
    function _isMin() { return _minState(MIN_KEY); }
    function toggleMin(ev) {
        try { if (ev) { ev.stopPropagation(); ev.preventDefault(); } } catch (_) {}
        _setMin(MIN_KEY, !_isMin());
        document.querySelectorAll('.rf-strip[data-brand]').forEach((el) => { el.outerHTML = stripHtml(el.dataset.brand); });
        _countdown();
    }
    function _miniLine() {
        const d = _d || {}; const me = d.me || {};
        if (d.myWin && !d.myWin.delivered) return '🎉 ¡Ganaste el ' + d.myWin.pos + '° puesto!';
        if (d.notStarted !== false) { const t = _left(d.startsAt || '2026-11-01T03:00:00.000Z'); return 'Empieza en ' + t.d + ' d ' + t.h + ' h'; }
        return me.position ? 'Vas ' + me.position + '° · ' + num(me.points) + ' pts' : 'Sumá puntos: $100.000 = 100 pts';
    }
    // Recuadro compacto (arriba de las páginas y en el Inicio): título, cuenta regresiva y los 3 trofeos.
    function stripHtml(brand) {
        const d = _d || {}; const ns = d.notStarted !== false; const st = d.startsAt || '2026-11-01T03:00:00.000Z'; const to = ns ? st : d.closesAt; const b = esc(brand || 'picaroja');
        if (_isMin()) return '<div class="rf-strip rf-sb-' + b + ' rf-min" data-brand="' + b + '"><button type="button" class="rf-mini" onclick="VIP.raffle.toggleMin(event)"><img src="/images/sorteo/premios/iphone.svg" alt=""><span><b>🏆 Sorteo mensual</b><small>' + esc(_miniLine()) + '</small></span><em>Ver más ▾</em></button></div>';
        return '<div class="rf-strip rf-sb-' + b + '" data-brand="' + b + '">' +
            '<div class="rf-box" role="button" tabindex="0" onclick="VIP.raffle.open(\'' + b + '\')"><div class="rf-box-h"><b>🏆 Sorteo mensual</b><span>' + (ns ? 'Empieza en' : 'Termina en') + '</span><button type="button" class="rf-minbtn" onclick="VIP.raffle.toggleMin(event)" aria-label="Minimizar">–</button></div><div class="rf-count js-rf-count" data-to="' + esc(to || '') + '"></div>' + _trophies(d.prizes || DEF.prizes, 'active') + '<em class="rf-box-go">Ver ranking ›</em></div>' +
            '<div class="rf-box rf-box-soon" role="button" tabindex="0" onclick="VIP.raffle.open(\'' + b + '\')"><div class="rf-box-h"><b>🚗 ' + esc((d.upcoming && d.upcoming.title) || DEF.upcoming.title) + '</b><span>Empieza en</span></div><div class="rf-count js-rf-count" data-to="' + esc(st) + '"></div>' + _trophies((d.upcoming && d.upcoming.prizes) || DEF.upcoming.prizes, 'upcoming') + '</div></div>';
    }
    // #929 (owner): para SUMAR hay que ANOTARSE: app instalada con notificaciones + Telegram (ahí se anuncian los ganadores de todos los premios).
    function _joinHtml(d) {
        if (d.joined) return '<section class="rf-joined">✅ Estás anotado desde el ' + esc(fdate(d.joinedAt)) + ': sumás puntos desde ese momento.</section>';
        const r = d.requirements || {};
        const row = (ok, txt, btn) => '<li class="' + (ok ? 'ok' : '') + '"><span>' + (ok ? '✅' : '⬜') + '</span><b>' + txt + '</b>' + (ok ? '' : btn) + '</li>';
        return '<section class="rf-card rf-join"><b>📝 Anotate para empezar a sumar</b><p>Sólo suman los anotados, desde el momento en que se anotan. Requisitos:</p><ul>' +
            row(r.app, 'App de PICA ROJA instalada', '<button type="button" onclick="VIP.ui.installApp && VIP.ui.installApp()">Instalar</button>') +
            row(r.notif, 'Notificaciones activadas', '<button type="button" onclick="VIP.raffle.notif()">Activar</button>') +
            row(r.telegram, 'Unido a Telegram (ahí anunciamos los ganadores)', '<button type="button" onclick="VIP.raffle.telegram()">Unirme</button>') +
            '</ul><button type="button" class="rf-btn" onclick="VIP.raffle.join()"' + (r.ok ? '' : ' disabled') + '>Anotarme</button>' +
            (r.app ? '' : '<p class="rf-join-sub">Si ya la instalaste, abrí el sorteo desde la app instalada.</p>') + '</section>';
    }
    async function _post(path) { const r = await fetch(VIP.config.API_URL + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + VIP.state.currentToken }, body: '{}' }); return { r, d: await r.json().catch(() => ({})) }; }
    async function telegram() {
        let w = null; try { w = window.open('about:blank', '_blank'); } catch (_) {}
        try { const { d } = await _post('/api/raffle/telegram'); if (d.url) { if (w) w.location.href = d.url; else window.open(d.url, '_blank', 'noopener'); } else if (w) w.close(); } catch (_) { try { if (w) w.close(); } catch (__) {} }
        _load();
    }
    async function notif() {
        try { if (typeof window.enableNotifications === 'function') await window.enableNotifications(); else if (window.Notification) await Notification.requestPermission(); } catch (_) {}
        setTimeout(_load, 1500);
    }
    async function join() {
        try { const { r, d } = await _post('/api/raffle/join'); if (r.ok) { try { VIP.ui.showToast('✅ ¡Listo! Ya estás anotado: desde ahora sumás puntos.', 'success'); } catch (_) {} } else { try { VIP.ui.showToast(d.error || 'Te falta algún requisito', 'error'); } catch (_) {} } } catch (_) {}
        _load();
    }
    // #928 (owner): premio extra — $100.000 en 10 ganadores de $10.000 por cada 100 clientes con al menos 2 cargas en el mes.
    function _extraHtml(x, ns) {
        if (!x) return '';
        return '<section class="rf-card rf-extra"><b>🎁 Premio extra: ' + money(x.pool) + ' en ' + num(x.winnersPerGroup) + ' ganadores de ' + money(x.perWinner) + '</b>' +
            '<p>Por cada ' + num(x.groupSize) + ' clientes con al menos ' + num(x.minDeposits) + ' cargas en el mes se sortean ' + num(x.winnersPerGroup) + ' premios de ' + money(x.perWinner) + '. Participan todos los que cumplan, sin importar el ranking.</p>' +
            (ns ? '' : '<p class="rf-extra-me">' + (x.imIn ? '✅ Ya estás participando (' + num(x.myDeposits) + ' cargas este mes).' : '⏳ Te falta' + (x.minDeposits - x.myDeposits === 1 ? ' 1 carga' : 'n ' + num(Math.max(0, x.minDeposits - x.myDeposits)) + ' cargas') + ' este mes para participar.') + ' Hoy califican ' + num(x.eligibleNow) + ' clientes ⇒ ' + num(x.winnersNow) + ' premios.</p>') +
            (x.last ? '<p class="rf-extra-last">Ganadores de ' + esc(x.last.monthLabel) + ': ' + x.last.winners.map(esc).join(' · ') + (x.last.meWon ? ' · 🎉 ¡Vos ganaste!' : '') + '</p>' : '') + '</section>';
    }
    // #921 GRAN SORTEO: también por puntos + extras por actividad (días con carga) y por misiones semanales.
    function _granHtml(g, up) {
        if (!g) return '';
        const me = g.me || {}; const end = fdate(g.endsAt); const ns = g.notStarted;
        return '<section class="rf-box rf-box-soon rf-gran"><div class="rf-box-h"><b>🚗 ' + esc(g.title || 'Gran Sorteo') + '</b><span>' + (ns ? 'Empieza en' : 'Termina en') + '</span></div><div class="rf-count js-rf-count" data-to="' + esc(ns ? g.startsAt : g.endsAt) + '"></div>' + _trophies((up && up.prizes) || g.prizes, 'upcoming') +
            '<ul class="rf-gran-how"><li>🎰 <b>100 pts</b> cada $100.000 apostados</li><li>📅 <b>+' + num(g.dailyPoints) + ' pts</b> por cada día que cargás $' + num(g.dailyMinArs) + ' o más</li><li>🎯 <b>+' + num(g.missionPct) + '%</b> de tus puntos de la semana si completás tus misiones semanales</li></ul>' +
            (!ns ? '<div class="rf-gran-me"><div><small>Tu puesto</small><b>' + (me.position ? me.position + '°' : '—') + '</b></div><div><small>Puntos</small><b>' + num(me.points) + '</b></div></div>' +
                '<p class="rf-pod-txt">Apuestas ' + num(me.base) + ' + días activos ' + num(me.daily) + ' (' + num(me.activeDays) + ' días) + misiones ' + num(me.missions) + ' (' + num(me.missionWeeks) + ' sem.)' + (me.position > 1 ? ' · te faltan <b>' + num(me.toFirst) + '</b> para el 1°' : '') + '</p>' +
                ((g.top || []).length ? '<ol class="rf-rank">' + g.top.map((t) => '<li class="' + (t.me ? 'me' : '') + (t.pos <= 3 ? ' top' : '') + '"><span class="rf-pos">' + (t.pos <= 3 ? trophy(t.pos) : t.pos + '°') + '</span><span class="rf-name">' + esc(t.name) + (t.me ? ' (vos)' : '') + '</span><b>' + num(t.points) + ' pts</b></li>').join('') + '</ol>' : '') : '') +
            '<p class="rf-pod-txt">Del ' + esc(fdate(g.startsAt)) + ' al ' + esc(end) + '. Ganan los 3 con más puntos.</p></section>';
    }
    function _render() {
        const m = $('rfMain'); if (!m) return;
        if (!_d) { m.innerHTML = '<div class="rf-note">Cargando el sorteo…</div>'; return; }
        const me = _d.me || {}; const pos = me.position; const ns = !!_d.notStarted; const win = _d.myWin;
        m.innerHTML =
            '<section class="rf-box rf-box-big"><div class="rf-box-h"><b>' + (ns ? 'Empieza el 1 de ' + esc(_d.monthLabel.split(' ')[0]) : 'Termina el ' + esc(fdate(_d.closesAt, true)) + ' h') + '</b><span>' + (ns ? 'Faltan' : 'Quedan') + '</span></div><div class="rf-count js-rf-count" data-to="' + esc(ns ? _d.startsAt : _d.closesAt) + '"></div>' + _trophies(_d.prizes, 'active') + '</section>' +
            _joinHtml(_d) +
            _extraHtml(_d.extra, ns) +
            (win ? '<section class="rf-card rf-win"><b>🎉 ¡Ganaste el ' + win.pos + '° puesto de ' + esc(win.monthLabel) + '!</b><p>' + esc(win.prize) + '</p>' + (win.delivered ? '<p class="rf-ok">✅ Premio entregado.</p>' : '<button type="button" class="rf-btn" onclick="VIP.raffle.contact()">🏆 Coordinar la entrega</button>') + '</section>' : '') +
            (!ns ? '<section class="rf-mine">' + (pos ? '<b>' + pos + '°</b><span>' + num(me.points) + ' pts' + (pos > 1 ? ' · te faltan <b>' + num(me.toFirst) + '</b> para el 1°' : ' · ¡vas primero!') + '</span>' : '<span>Todavía no sumaste puntos este mes · cada $100.000 apostados = 100 pts</span>') + '</section>' : '') +
            '<section class="rf-sec"><h3>📊 Ranking' + (ns ? '' : ' <small>' + num(_d.participants) + ' participando</small>') + '</h3>' +
            (ns ? '<div class="rf-note">El ranking arranca el 1 de ' + esc(_d.monthLabel.split(' ')[0]) + '. Cada $100.000 apostados = 100 puntos.</div>' :
                ((_d.top || []).length ? '<ol class="rf-rank">' + _d.top.map((t) => '<li class="' + (t.me ? 'me' : '') + (t.pos <= 3 ? ' top' : '') + '"><span class="rf-pos">' + (t.pos <= 3 ? trophy(t.pos) : t.pos + '°') + '</span><span class="rf-name">' + esc(t.name) + (t.me ? ' (vos)' : '') + '</span><b>' + num(t.points) + ' pts</b></li>').join('') + '</ol>' : '<div class="rf-note">Todavía nadie sumó puntos. ¡Sé el primero!</div>')) + '</section>' +
            // #920: cómo vienen los ganadores — podio (2° · 1° · 3°) con los premios; con el mes cerrado, los nombres tapados.
            '<section class="rf-sec"><h3>🏅 Ganadores</h3><div class="rf-podium">' + [1, 0, 2].map((i) => { const w = _d.lastWinners && _d.lastWinners.winners[i]; const p = (_d.prizes || [])[i] || {}; return '<div class="rf-pod rf-pod' + (i + 1) + '">' + trophy(i + 1) + '<b>' + esc(w ? w.name : (i + 1) + '° puesto') + '</b><small>' + esc(w ? w.prize : p.title || '') + '</small><span class="rf-pod-base">' + (i + 1) + '</span></div>'; }).join('') + '</div>' +
            '<p class="rf-pod-txt">' + (_d.lastWinners ? 'Ganadores de ' + esc(_d.lastWinners.monthLabel) + '. ' : '') + 'Los 3 con más puntos al cierre ganan. Se publican el ' + esc(fdate(_d.announceAt, true)) + ' h y los contacta nuestro Soporte de entrega de premios.</p></section>' +
            _granHtml(_d.gran, _d.upcoming) +
            '<details class="rf-bases"><summary>📜 Bases y condiciones</summary><ul class="rf-rules">' +
            '<li><b>Empieza:</b> el 1 de noviembre de 2026. Lo jugado antes no suma.</li>' +
            '<li><b>Hay que anotarse:</b> para sumar puntos tenés que anotarte en esta pantalla, con la app de PICA ROJA instalada, las notificaciones activadas y unido a nuestro Telegram (ahí anunciamos los ganadores de todos los premios del mes). Sumás desde el momento en que te anotás; el extra y el Gran Sorteo también son sólo para anotados.</li>' +
            '<li><b>Participan:</b> clientes registrados en la app de PICA ROJA con al menos una carga real en el mes. Suma lo jugado en PICA ROJA, JUGAYGANA, Ganamos o Girox (misma cuenta).</li>' +
            '<li><b>Puntos:</b> cada $100.000 apostados con plata real = 100 puntos. Los bonos no suman: se toma la parte de lo apostado proporcional a tus cargas reales del mes (ej.: cargaste $100.000 y recibiste $50.000 de bono ⇒ cuenta 2/3 de lo apostado).' + (!ns && me.wagered ? ' Lo tuyo: ' + money(me.wagered) + ' apostado × ' + money(me.deposits) + ' ÷ ' + money((me.deposits || 0) + (me.bonusGranted || 0)) + ' = ' + money(me.validWagered) + ' ⇒ ' + num(me.points) + ' pts.' : '') + '</li>' +
            '<li><b>Hasta cuándo suma:</b> hasta el ' + esc(fdate(_d.closesAt, true)) + ' h (hora argentina). Se actualiza cada 20 minutos.</li>' +
            '<li><b>Ganadores:</b> los 3 primeros del ranking, publicados el ' + esc(fdate(_d.announceAt, true)) + ' h en el menú completo, con nombres tapados. Empate: más apostado válido; si sigue igual, quien llegó antes.</li>' +
            '<li><b>Entrega:</b> dentro de los ' + num(_d.deliveryBusinessDays) + ' días hábiles, con nuestro Soporte exclusivo de entrega de premios, al titular de la cuenta con su DNI.' + (_d.cashOption ? ' Cada premio puede cobrarse en efectivo.' : '') + '</li>' +
            (_d.extra ? '<li><b>Premio extra:</b> además del ranking, todos los clientes con al menos ' + num(_d.extra.minDeposits) + ' cargas reales en el mes participan de ' + money(_d.extra.pool) + ' repartidos en ' + num(_d.extra.winnersPerGroup) + ' ganadores de ' + money(_d.extra.perWinner) + ' por cada ' + num(_d.extra.groupSize) + ' clientes que cumplan (ej.: 250 clientes ⇒ 20 ganadores). Se sortea el día del cierre con un método verificable y los ganadores se publican con el nombre tapado.</li>' : '') +
            '<li><b>El formato del sorteo cambia mes a mes:</b> premios, extras y reglas de cada mes se publican acá antes de que empiece; lo que vale es lo publicado para ese mes.</li>' +
            '<li><b>Transparencia:</b> cada jugador ve su puesto y sus puntos en todo momento. Una persona = una cuenta; las cuentas duplicadas o con jugadas irregulares quedan fuera.</li>' +
            (_d.gran ? '<li><b>Gran Sorteo (' + esc(_d.gran.title || '') + '):</b> del ' + esc(fdate(_d.gran.startsAt)) + ' al ' + esc(fdate(_d.gran.endsAt)) + ' (hora argentina). Suma: 100 puntos cada $100.000 apostados con plata real (misma regla que el mensual) + ' + num(_d.gran.dailyPoints) + ' puntos por cada día con cargas reales que sumen $' + num(_d.gran.dailyMinArs) + ' o más + ' + num(_d.gran.missionPct) + '% de los puntos de cada semana (lunes a domingo) en la que completes misiones semanales. Ganan los 3 con más puntos al cierre; se publican al día siguiente y se entregan igual que el mensual (también en efectivo).</li>' : '') +
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
    // #922 (owner): los sorteos del Inicio se minimizan; minimizados queda UNA línea con el puesto en cada sorteo (o cuánto falta para empezar).
    const HMIN_KEY = 'vip_rf_home_min';
    function _hMin() { return _minState(HMIN_KEY); }
    function _homeMini(t, t2) {
        document.querySelectorAll('.rf-entries').forEach((box) => {
            if (!box.querySelector('.rf-ent-min')) box.insertAdjacentHTML('beforeend', '<button type="button" class="rf-ent-min" onclick="VIP.raffle.toggleHomeMin(event)" aria-label="Minimizar">–</button><button type="button" class="rf-ent-mini" onclick="VIP.raffle.toggleHomeMin(event)"><span>🏆</span><b>Mensual: <em class="js-rf-m1">' + esc(t || '') + '</em></b><b>Gran: <em class="js-rf-m2">' + esc(t2 || '') + '</em></b><i>Ver más ▾</i></button>');
            box.classList.toggle('is-min', _hMin());
            if (t != null) box.querySelectorAll('.js-rf-m1').forEach((e) => { e.textContent = t; });
            if (t2 != null) box.querySelectorAll('.js-rf-m2').forEach((e) => { e.textContent = t2; });
        });
    }
    function toggleHomeMin(ev) {
        try { if (ev) { ev.stopPropagation(); ev.preventDefault(); } } catch (_) {}
        _setMin(HMIN_KEY, !_hMin());
        _homeMini(null, null);
    }
    try { setTimeout(() => _homeMini('Empieza en noviembre', 'Empieza en noviembre'), 0); } catch (_) {}
    // Botón del Inicio: "Vas 4° · 500 pts · te faltan 2.501 para el 1°" (se refresca cada 10 min, sólo con sesión).
    let _entAt = 0;
    async function paintEntries() {
        if (!(VIP.state && VIP.state.currentToken) || Date.now() - _entAt < 10 * 60 * 1000) return; _entAt = Date.now();
        try {
            const r = await fetch(VIP.config.API_URL + '/api/raffle', { headers: { Authorization: 'Bearer ' + VIP.state.currentToken } }); if (!r.ok) return;
            const d = await r.json(); _d = d; const me = d.me || {};
            document.querySelectorAll('.rf-strip[data-brand]').forEach((el) => { el.outerHTML = stripHtml(el.dataset.brand); }); // #920: con los datos reales (puesto)
            const lf = _left(d.startsAt); const t = !d.joined ? 'Anotate para sumar' : d.notStarted ? 'Empieza en ' + lf.d + 'd ' + lf.h + 'h' : d.myWin && !d.myWin.delivered ? '🎉 ¡Ganaste! Tocá acá' : (me.position ? 'Vas ' + me.position + '° · ' + num(me.points) + ' pts' : 'Sumá puntos jugando');
            document.querySelectorAll('.js-rf-pos').forEach((e) => { e.textContent = t; });
            const g2 = d.gran || {}; const t2 = (g2.notStarted !== false) ? 'Empieza en ' + lf.d + 'd ' + lf.h + 'h' : (g2.me && g2.me.position ? 'Vas ' + g2.me.position + '° · ' + num(g2.me.points) + ' pts' : 'Sumá puntos jugando');
            document.querySelectorAll('.js-rf-gran').forEach((e) => { e.textContent = t2; });
            _homeMini(t, t2);
        } catch (_) {}
    }
    try { setTimeout(function loop() { paintEntries(); setTimeout(loop, 60 * 1000); }, 4000); } catch (_) {}
    try { setInterval(() => { if (document.querySelector('.js-rf-count')) _countdown(); }, 1000); } catch (_) {} // cuentas regresivas visibles (páginas, Inicio, sorteo)
    return { open, close, contact, paintEntries, stripHtml, toggleMin, toggleHomeMin, join, telegram, notif, tick: _countdown };
})();
