// ========================================
// #907 (owner 2026-10-23): PÁGINA EXCLUSIVA PICA ROJA — lobby propio con TODOS los juegos de Girox (misma cuenta y saldo: es otra
// puerta a Girox). Portadas de PICA ROJA arriba, deslizantes por sección (Populares, Nuevos, proveedores), "Todos los juegos" hasta el
// final del catálogo, En vivo y Deportes (los dos de Girox, con el mismo ingreso logueado), y barra de abajo: Inicio · En vivo ·
// Deportes · Cargar · Soporte. Cada juego se abre con el ingreso de los favoritos (VIP.home.gamePlay ⇒ directo al juego).
// Se abre desde la plataforma "PICA ROJA" (predeterminada) o con picaroja.com/paginaoficial (⇒ /?pr=1).
// ========================================
window.VIP = window.VIP || {};
VIP.lobby = (function () {
    let _data = null, _view = 'inicio', _q = '', _qTimer = null, _allPage = 0, _allMore = true, _allProv = null, _loadingAll = false, _balTimer = null;
    const $ = (id) => document.getElementById(id);
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const img = (u) => (u ? (/^\/images\//.test(u) ? u : '/api/games/img?u=' + encodeURIComponent(u)) : '');
    const auth = () => ({ Authorization: 'Bearer ' + ((VIP.state && VIP.state.currentToken) || '') });

    // #909: íconos de línea (estilo Stake), sin color.
    const IC = {
        home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
        slots: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M9 5v14M15 5v14"/>',
        live: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3z"/>',
        sport: '<circle cx="12" cy="12" r="9"/><path d="M12 7l4 3-1.5 5h-5L8 10z"/>',
        chat: '<path d="M4 5h16v11H9l-5 4z"/>',
        fire: '<path d="M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-3 2-4 2-7 2 1 3 2 3-3z"/>',
        star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
        grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
        tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.5"/>',
        search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
        menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
        up: '<path d="M6 5h12M12 20V9M7 13l5-5 5 5"/>'
    };
    const ico = (k) => '<svg class="prl-ic" viewBox="0 0 24 24" aria-hidden="true">' + (IC[k] || '') + '</svg>';
    const BANNERS = [['/images/picaroja/b1.svg', 'slots'], ['/images/picaroja/b2.svg', 'vivo'], ['/images/picaroja/b3.svg', 'deportes']];
    let _provOpen = false;
    function _shell() {
        if ($('prLobby')) return $('prLobby');
        const nb = (v, k, t) => '<button type="button" data-v="' + v + '" onclick="VIP.lobby.go(\'' + v + '\')">' + ico(k) + '<span>' + t + '</span></button>';
        document.body.insertAdjacentHTML('beforeend',
            '<div id="prLobby" class="prl" hidden role="dialog" aria-label="PICA ROJA · Página exclusiva">' +
            '<header class="prl-top"><button type="button" class="prl-brandbtn" onclick="VIP.lobby.go(\'inicio\')" aria-label="Inicio"><img src="/images/picaroja/logo-mono.svg" alt="" class="prl-logo"><span class="prl-brand"><b>PICA ROJA</b><small>Página exclusiva</small></span></button>' +
            '<div class="prl-wallet"><span class="prl-bal" id="prlBal">—</span><button type="button" class="prl-load" onclick="VIP.lobby.load()">Cargar</button></div>' +
            '<button type="button" class="prl-x" onclick="VIP.lobby.menu()" aria-label="Menú y perfil">' + ico('menu') + '</button></header>' +
            '<main class="prl-main" id="prlMain"></main>' +
            '<button type="button" class="prl-top-btn" id="prlUp" hidden onclick="VIP.lobby.top()" aria-label="Volver arriba">' + ico('up') + '</button>' +
            '<nav class="prl-nav" aria-label="Menú">' + nb('slots', 'slots', 'Slots') + nb('vivo', 'live', 'En vivo') +
            '<button type="button" data-v="inicio" class="prl-home" onclick="VIP.lobby.go(\'inicio\')"><img src="/images/picaroja/logo-mono.svg" alt=""><span>Inicio</span></button>' +
            nb('deportes', 'sport', 'Deportes') + '<button type="button" data-v="menu" onclick="VIP.lobby.menu()">' + ico('menu') + '<span>Menú</span></button>' +
            '</nav>' +
            '<div class="prl-drawer" id="prlDrawer" hidden onclick="if(event.target===this)VIP.lobby.menu(false)"><aside class="prl-dr" role="dialog" aria-label="Mi cuenta"><div id="prlDrBody"></div></aside></div>' +
            '</div>');
        return $('prLobby');
    }
    function _paintBal() {
        try { const src = $('userBalance'); const b = $('prlBal'); if (src && b && src.textContent) b.textContent = src.textContent.replace(/^\s*Saldo:?\s*/i, ''); } catch (_) {}
    }
    function _card(g) {
        return '<button type="button" class="prl-g" onclick="VIP.lobby.play(\'' + esc(g.key) + '\', this)" data-name="' + esc(g.name) + '" title="' + esc(g.name) + '" aria-label="' + esc(g.name) + '">' +
            '<span class="prl-gi">' + (g.img ? '<img loading="lazy" decoding="async" src="' + esc(img(g.img)) + '" alt="" onerror="this.remove()">' : '') + (g.isNew ? '<em class="prl-new">NUEVO</em>' : '') + '<i>' + esc(g.name) + '</i></span></button>';
    }
    function _title(icon, title, onclick) {
        return '<div class="prl-sh">' + (onclick ? '<button type="button" class="prl-st" onclick="' + onclick + '">' : '<span class="prl-st">') + ico(icon) + '<h3>' + esc(title) + '</h3>' + (onclick ? '<b class="prl-chev">›</b></button>' : '</span>') + '</div>';
    }
    // #909: secciones como Stake: de a 3 por fila; "Ver más" despliega de a 6 (el orden de los juegos es el de Girox: más jugados primero).
    let _secN = 0;
    function _row(icon, title, games, providerId) {
        if (!games || !games.length) return '';
        const id = 'prlS' + (++_secN);
        return '<section class="prl-sec">' + _title(icon, title, providerId ? 'VIP.lobby.all(' + Number(providerId) + ', \'' + esc(title).replace(/'/g, '') + '\')' : null) +
            '<div class="prl-grid prl-g3" id="' + id + '" data-show="6">' + games.map((g, i) => _card(g).replace('class="prl-g"', 'class="prl-g' + (i >= 6 ? ' prl-hid' : '') + '"')).join('') + '</div>' +
            (games.length > 6 ? '<div class="prl-more"><button type="button" onclick="VIP.lobby.more(\'' + id + '\', this)">Ver más</button></div>' : '') + '</section>';
    }
    function more(id, btn) {
        const box = $(id); if (!box) return;
        const hid = box.querySelectorAll('.prl-hid'); for (let i = 0; i < Math.min(6, hid.length); i++) hid[i].classList.remove('prl-hid');
        if (box.querySelectorAll('.prl-hid').length === 0 && btn) btn.closest('.prl-more').remove();
    }
    function _hero() {
        return '<div class="prl-hero" id="prlHero">' + BANNERS.map((b) => '<button type="button" class="prl-slide" onclick="VIP.lobby.go(\'' + b[1] + '\')"><img src="' + b[0] + '" alt="PICA ROJA" decoding="async"></button>').join('') + '</div>';
    }
    // #909: proveedores como Stake (logo sin color, en recuadro) — se despliegan con "Ver más" y llevan a sus juegos.
    function _provTile(p) {
        // #910: los logos de Girox son casi todos íconos (sin el nombre): ícono chico en gris + NOMBRE en texto, para que se entienda.
        return '<button type="button" class="prl-pv" onclick="VIP.lobby.all(' + Number(p.id) + ', \'' + esc(p.name).replace(/'/g, '') + '\')" aria-label="' + esc(p.name) + '">' +
            '<span class="prl-pvb">' + (p.logo ? '<img loading="lazy" src="/api/games/img?u=' + encodeURIComponent(p.logo) + '" alt="" onerror="this.remove()">' : '') + '<b>' + esc(p.name) + '</b></span>' +
            '<small><i class="prl-dot"></i>' + Number(p.count || 0).toLocaleString('es-AR') + ' juegos</small></button>';
    }
    function _providers(list) {
        const ps = (list || []).filter((p) => p.count > 0); if (!ps.length) return '';
        const shown = _provOpen ? ps : ps.slice(0, 8);
        return '<section class="prl-sec">' + _title('tag', 'Proveedores', null) + '<div class="prl-pvs' + (_provOpen ? ' open' : '') + '">' + shown.map(_provTile).join('') + '</div>' +
            (ps.length > 8 ? '<div class="prl-more"><button type="button" onclick="VIP.lobby.provToggle()">' + (_provOpen ? 'Ver menos' : 'Ver más (' + ps.length + ')') + '</button></div>' : '') + '</section>';
    }
    function _search() {
        return '<label class="prl-search">' + ico('search') + '<input type="search" id="prlQ" placeholder="Buscar juegos" autocomplete="off" value="' + esc(_q) + '" oninput="VIP.lobby.search(this.value)"></label><div id="prlRes"></div>';
    }
    function _render() {
        const m = $('prlMain'); if (!m) return; _secN = 0;
        document.querySelectorAll('.prl-nav [data-v]').forEach((b) => b.classList.toggle('on', b.dataset.v === _view || (_view === 'all' && b.dataset.v === 'slots')));
        if (!_data) { m.innerHTML = _hero() + '<div class="prl-note">Cargando los juegos…</div>'; return; }
        if (_view === 'deportes') {
            m.innerHTML = _title('sport', 'Deportes', null) + '<div class="prl-sports">' + (_data.sports || []).map((s, i) => '<button type="button" class="prl-sport" onclick="VIP.lobby.sport(\'' + esc(s.path) + '\')"><img src="/images/picaroja/b3.svg" alt="" class="prl-sport-bg' + (i ? ' alt' : '') + '"><span><b>' + esc(s.title) + '</b><small>' + esc(s.sub) + '</small></span></button>').join('') + '</div><p class="prl-note">Entrás con tu misma cuenta y tu saldo.</p>';
            return;
        }
        if (_view === 'vivo') {
            m.innerHTML = _title('live', 'Casino en vivo', null) + ((_data.live || []).map((s) => _row('live', s.title, s.games, s.providerId)).join('') || '<div class="prl-note">No hay mesas en vivo para mostrar ahora.</div>') +
                _providers((_data.providers || []).filter((p) => p.live));
            return;
        }
        if (_view === 'slots' || _view === 'all') {
            const t = _allProv ? _allProv.name : 'Slots · todos los juegos';
            m.innerHTML = '<div class="prl-sh"><span class="prl-st">' + ico('slots') + '<h3>' + esc(t) + '</h3></span>' + (_allProv ? '<button type="button" class="prl-back" onclick="VIP.lobby.all(null)">Ver todos</button>' : '') + '</div>' +
                (_allProv ? '' : _search()) + '<div class="prl-grid" id="prlAll"></div><div class="prl-note" id="prlAllMore">Cargando…</div>';
            _allPage = 0; _allMore = true; _moreAll(); if (_q && !_allProv) search(_q); return;
        }
        m.innerHTML = _hero() + _providers(_data.providers) + _search() +
            _row('fire', 'Populares', _data.popular) + _row('star', 'Nuevos', _data.nuevos) +
            (_data.live && _data.live[0] ? _row('live', 'En vivo · ' + _data.live[0].title, _data.live[0].games, _data.live[0].providerId) : '') +
            (_data.sections || []).map((s) => _row('slots', s.title, s.games, s.providerId)).join('') +
            '<div class="prl-more"><button type="button" onclick="VIP.lobby.go(\'slots\')">Ver los ' + Number(_data.total || 0).toLocaleString('es-AR') + ' juegos</button></div>';
        if (_q) search(_q);
    }
    async function _moreAll() {
        if (_loadingAll || !_allMore) return; _loadingAll = true;
        try {
            _allPage++;
            const r = await fetch(VIP.config.API_URL + '/api/games/catalog?page=' + _allPage + (_allProv ? '&provider=' + _allProv.id : ''), { headers: auth() });
            const d = await r.json().catch(() => ({}));
            const box = $('prlAll'); if (!box) return;
            if (r.ok) { box.insertAdjacentHTML('beforeend', (d.games || []).map(_card).join('')); _allMore = !!d.hasMore; }
            else _allMore = false;
            const more = $('prlAllMore'); if (more) more.textContent = _allMore ? 'Cargando más…' : 'Llegaste al final ✔';
        } catch (_) { _allMore = false; } finally { _loadingAll = false; }
    }
    function _onScroll() {
        const m = $('prlMain'); if (!m) return;
        const up = $('prlUp'); if (up) up.hidden = m.scrollTop < 700;
        if (_view !== 'all' && _view !== 'slots') return;
        if (m.scrollTop + m.clientHeight > m.scrollHeight - 600) _moreAll();
    }
    async function _load() {
        try {
            const r = await fetch(VIP.config.API_URL + '/api/games/lobby', { headers: auth() });
            const d = await r.json().catch(() => ({}));
            if (r.ok) { _data = d; _render(); }
            else { const m = $('prlMain'); if (m) m.innerHTML = _hero() + '<div class="prl-note">' + esc(d.error || 'No pudimos traer los juegos. Probá de nuevo.') + '</div>'; }
        } catch (_) { const m = $('prlMain'); if (m) m.innerHTML = _hero() + '<div class="prl-note">Sin conexión. Probá de nuevo.</div>'; }
    }
    function open(view) {
        const el = _shell(); el.hidden = false; document.body.classList.add('prl-open');
        _view = view || 'inicio'; _render(); _paintBal();
        clearInterval(_balTimer); _balTimer = setInterval(_paintBal, 5000);
        const m = $('prlMain'); if (m && !m._prlScroll) { m._prlScroll = true; m.addEventListener('scroll', _onScroll, { passive: true }); }
        if (!_data) _load();
    }
    function close() { const el = $('prlLobby'); if (el) el.hidden = true; document.body.classList.remove('prl-open'); clearInterval(_balTimer); }
    function go(view) { if (view === 'slots') _allProv = null; _view = view; _render(); const m = $('prlMain'); if (m) m.scrollTop = 0; }
    function all(providerId, name) { _allProv = providerId ? { id: providerId, name: name || 'Proveedor' } : null; go(providerId ? 'all' : 'slots'); }
    function provToggle() { _provOpen = !_provOpen; _render(); }
    function search(v) {
        _q = String(v || '').trim();
        clearTimeout(_qTimer);
        const box = $('prlRes'); if (!box) return;
        if (_q.length < 2) { box.innerHTML = ''; return; }
        _qTimer = setTimeout(async () => {
            box.innerHTML = '<div class="prl-note">Buscando…</div>';
            try {
                const r = await fetch(VIP.config.API_URL + '/api/games/catalog?q=' + encodeURIComponent(_q), { headers: auth() });
                const d = await r.json().catch(() => ({}));
                const g = (r.ok && d.games) || [];
                box.innerHTML = g.length ? '<div class="prl-grid">' + g.map(_card).join('') + '</div>' : '<div class="prl-note">No encontramos "' + esc(_q) + '".</div>';
            } catch (_) { box.innerHTML = '<div class="prl-note">Sin conexión.</div>'; }
        }, 350);
    }
    function play(key, btn) {
        const name = (btn && btn.dataset && btn.dataset.name) || 'el juego';
        if (VIP.home && VIP.home.gamePlay) VIP.home.gamePlay(key, name);
    }
    function sport(path) {
        close();
        try { if (VIP.ui.casinoGoTo && VIP.ui.casinoGoTo(path)) return; } catch (_) {}
        try { VIP.ui._casinoGamePath = path; } catch (_) {}
        try { VIP.home.openPlatform('girox', { embed: true }); } catch (_) {}
    }
    // #909 (owner): MENÚ con el perfil: saldo, nivel y rango (VIP), y Soporte adentro (salió de la barra de abajo).
    async function menu(show) {
        const dr = $('prlDrawer'); if (!dr) return;
        if (show === false || (show == null && !dr.hidden)) { dr.hidden = true; return; }
        dr.hidden = false; _paintBal(); _paintMenu();
        if (!(VIP.state && VIP.state.vipStatus)) {
            try { const r = await fetch(VIP.config.API_URL + '/api/vip/status', { headers: auth() }); if (r.ok) { VIP.state.vipStatus = await r.json(); _paintMenu(); } } catch (_) {}
        }
    }
    function _paintMenu() {
        const b = $('prlDrBody'); if (!b) return;
        const u = (VIP.state && VIP.state.currentUser) || {}; const v = (VIP.state && VIP.state.vipStatus) || {};
        const lv = v.enabled !== false && v.level ? v.level : null; const nx = v.enabled !== false ? v.next : null;
        const pct = Math.max(0, Math.min(100, Math.round(Number(v.progressPct) || 0)));
        const money = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-AR');
        const item = (k, t, fn) => '<button type="button" class="prl-mi" onclick="' + fn + '">' + ico(k) + '<span>' + t + '</span><b class="prl-chev">›</b></button>';
        b.innerHTML =
            '<div class="prl-dr-head"><img src="/images/picaroja/logo-mono.svg" alt="" class="prl-logo"><div><b>' + esc(u.username || 'Mi cuenta') + '</b><small>PICA ROJA · Página exclusiva</small></div><button type="button" class="prl-x" onclick="VIP.lobby.menu(false)" aria-label="Cerrar">✕</button></div>' +
            '<div class="prl-dr-card"><small>Saldo</small><b class="prl-dr-bal">' + esc(($('prlBal') || {}).textContent || '—') + '</b>' +
            '<div class="prl-dr-btns"><button type="button" class="prl-load" onclick="VIP.lobby.load()">Cargar</button><button type="button" class="prl-ghost" onclick="VIP.lobby.withdraw()">Retirar</button></div></div>' +
            '<div class="prl-dr-card"><small>Nivel y rango</small>' +
            (lv ? '<b class="prl-dr-lvl">' + esc(lv.emoji || '') + ' ' + esc(lv.name) + '</b>' : '<b class="prl-dr-lvl">Jugador</b><span class="prl-dr-sub">Todavía sin nivel</span>') +
            (nx ? '<div class="prl-bar"><i style="width:' + pct + '%"></i></div><span class="prl-dr-sub">' + pct + '% · te faltan ' + money(v.faltaParaSubir) + ' apostados para ' + esc((nx.emoji || '') + ' ' + nx.name) + '</span>' : (lv ? '<span class="prl-dr-sub">Nivel máximo</span>' : '')) + '</div>' +
            '<div class="prl-dr-list">' + item('chat', 'Soporte', 'VIP.lobby.support()') + item('home', 'Mi perfil', 'VIP.lobby.profile()') + item('slots', 'Volver a la app', 'VIP.lobby.close()') + '</div>';
    }
    function withdraw() { menu(false); close(); try { VIP.withdraw.openWithdrawModal(); } catch (_) {} }
    function profile() { menu(false); close(); try { VIP.home.openProfile(); } catch (_) {} }
    function top() { const m = $('prlMain'); if (m) m.scrollTo ? m.scrollTo({ top: 0, behavior: 'smooth' }) : (m.scrollTop = 0); }
    function load() { menu(false); close(); try { if (VIP.home.easyLoad) VIP.home.easyLoad(); else VIP.home.setHomeMode('full'); } catch (_) {} }
    function support() { menu(false); close(); try { VIP.home.setHomeMode('mini'); } catch (_) {} }
    // picaroja.com/paginaoficial ⇒ /?pr=1: se abre apenas la app tiene sesión.
    try {
        if (/[?&]pr=1\b/.test(location.search)) {
            let n = 0; const t = setInterval(() => { n++; if (VIP.state && VIP.state.currentToken && VIP.config) { clearInterval(t); open('inicio'); try { history.replaceState(null, '', location.pathname); } catch (_) {} } else if (n > 60) clearInterval(t); }, 500);
        }
    } catch (_) {}
    return { open, close, go, all, provToggle, more, menu, withdraw, profile, top, search, play, sport, load, support };
})();
