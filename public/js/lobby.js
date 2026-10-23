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

    function _shell() {
        if ($('prLobby')) return $('prLobby');
        document.body.insertAdjacentHTML('beforeend',
            '<div id="prLobby" class="prl" hidden role="dialog" aria-label="PICA ROJA · Página exclusiva">' +
            '<header class="prl-top"><img src="/icons/icon-96x96.png" alt="" class="prl-logo"><div class="prl-brand"><b>PICA ROJA</b><small>Página exclusiva</small></div>' +
            '<div class="prl-bal"><small>Saldo</small><b id="prlBal">—</b></div><button type="button" class="prl-x" onclick="VIP.lobby.close()" aria-label="Volver a la app">✕</button></header>' +
            '<main class="prl-main" id="prlMain"></main>' +
            '<nav class="prl-nav" aria-label="Menú">' +
            '<button type="button" data-v="inicio" onclick="VIP.lobby.go(\'inicio\')"><span>🏠</span>Inicio</button>' +
            '<button type="button" data-v="vivo" onclick="VIP.lobby.go(\'vivo\')"><span>🎥</span>En vivo</button>' +
            '<button type="button" data-v="deportes" onclick="VIP.lobby.go(\'deportes\')"><span>⚽</span>Deportes</button>' +
            '<button type="button" class="prl-load" onclick="VIP.lobby.load()"><span>💳</span>Cargar</button>' +
            '<button type="button" onclick="VIP.lobby.support()"><span>💬</span>Soporte</button>' +
            '</nav></div>');
        return $('prLobby');
    }
    function _paintBal() {
        try { const src = $('userBalance'); const b = $('prlBal'); if (src && b && src.textContent) b.textContent = src.textContent.replace(/^\s*Saldo:?\s*/i, ''); } catch (_) {}
    }
    function _card(g) {
        return '<button type="button" class="prl-g" onclick="VIP.lobby.play(\'' + esc(g.key) + '\', this)" data-name="' + esc(g.name) + '">' +
            '<span class="prl-gi">' + (g.img ? '<img loading="lazy" decoding="async" src="' + esc(img(g.img)) + '" alt="" onerror="this.remove()">' : '') + (g.isNew ? '<em class="prl-new">NUEVO</em>' : '') + '<i>' + esc(g.name.slice(0, 2)) + '</i></span>' +
            '<span class="prl-gn">' + esc(g.name) + '</span><small>' + esc(g.provider || '') + '</small></button>';
    }
    function _row(title, games, providerId) {
        if (!games || !games.length) return '';
        return '<section class="prl-sec"><div class="prl-sh"><h3>' + esc(title) + '</h3>' + (providerId ? '<button type="button" onclick="VIP.lobby.all(' + Number(providerId) + ', \'' + esc(title) + '\')">Ver todos ›</button>' : '') + '</div>' +
            '<div class="prl-row">' + games.map(_card).join('') + '</div></section>';
    }
    function _hero() {
        const n = _data && _data.total ? Number(_data.total).toLocaleString('es-AR') : '8.000';
        const slides = [
            ['prl-h1', 'Página exclusiva', 'PICA ROJA', 'Más de ' + n + ' juegos con tu misma cuenta'],
            ['prl-h2', 'Casino en vivo', 'Mesas reales', 'Ruleta, blackjack y shows en directo'],
            ['prl-h3', 'Deportes', 'Apostá en vivo', 'Fútbol, básquet, tenis y mucho más']
        ];
        return '<div class="prl-hero" id="prlHero">' + slides.map((s, i) => '<div class="prl-slide ' + s[0] + '" onclick="VIP.lobby.go(\'' + (i === 1 ? 'vivo' : i === 2 ? 'deportes' : 'inicio') + '\')"><img src="/icons/icon-192x192.png" alt="" class="prl-slogo"><small>' + esc(s[1]) + '</small><b>' + esc(s[2]) + '</b><span>' + esc(s[3]) + '</span></div>').join('') + '</div>';
    }
    function _search() {
        return '<div class="prl-search"><input type="search" id="prlQ" placeholder="Buscá un juego (ej.: Olympus, Sweet Bonanza)" autocomplete="off" value="' + esc(_q) + '" oninput="VIP.lobby.search(this.value)"></div><div id="prlRes"></div>';
    }
    function _render() {
        const m = $('prlMain'); if (!m) return;
        document.querySelectorAll('.prl-nav [data-v]').forEach((b) => b.classList.toggle('on', b.dataset.v === _view));
        if (!_data) { m.innerHTML = _hero() + '<div class="prl-note">Cargando los juegos…</div>'; return; }
        if (_view === 'deportes') {
            m.innerHTML = '<h2 class="prl-h">⚽ Deportes</h2><div class="prl-sports">' + (_data.sports || []).map((s) => '<button type="button" class="prl-sport" onclick="VIP.lobby.sport(\'' + esc(s.path) + '\')"><b>' + esc(s.title) + '</b><span>' + esc(s.sub) + '</span><em>Entrar ›</em></button>').join('') + '</div><p class="prl-note">Entrás con tu misma cuenta y tu saldo.</p>';
            return;
        }
        if (_view === 'vivo') {
            m.innerHTML = '<h2 class="prl-h">🎥 Casino en vivo</h2>' + ((_data.live || []).map((s) => _row(s.title, s.games, s.providerId)).join('') || '<div class="prl-note">No hay mesas en vivo para mostrar ahora.</div>');
            return;
        }
        if (_view === 'all') {
            m.innerHTML = '<div class="prl-sh"><h2 class="prl-h">' + esc(_allProv ? _allProv.name : 'Todos los juegos') + '</h2><button type="button" onclick="VIP.lobby.go(\'inicio\')">‹ Volver</button></div><div class="prl-grid" id="prlAll"></div><div class="prl-note" id="prlAllMore">Cargando…</div>';
            _allPage = 0; _allMore = true; _moreAll(); return;
        }
        m.innerHTML = _hero() + _search() +
            _row('🔥 Populares', _data.popular) + _row('✨ Nuevos', _data.nuevos) +
            (_data.sections || []).map((s) => _row(s.title, s.games, s.providerId)).join('') +
            '<section class="prl-sec"><div class="prl-sh"><h3>🎰 Todos los juegos</h3></div><button type="button" class="prl-allbtn" onclick="VIP.lobby.all(null)">Ver los ' + Number(_data.total || 0).toLocaleString('es-AR') + ' juegos ›</button></section>' +
            '<section class="prl-sec"><div class="prl-sh"><h3>🏷️ Proveedores</h3></div><div class="prl-provs">' + (_data.providers || []).map((p) => '<button type="button" onclick="VIP.lobby.all(' + p.id + ', \'' + esc(p.name) + '\')">' + esc(p.name) + ' <small>' + p.count + '</small></button>').join('') + '</div></section>';
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
        if (_view !== 'all') return; const m = $('prlMain'); if (!m) return;
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
    function go(view) { _view = view; _render(); const m = $('prlMain'); if (m) m.scrollTop = 0; }
    function all(providerId, name) { _allProv = providerId ? { id: providerId, name: name || 'Proveedor' } : null; go('all'); }
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
    function load() { close(); try { if (VIP.home.easyLoad) VIP.home.easyLoad(); else VIP.home.setHomeMode('full'); } catch (_) {} }
    function support() { close(); try { VIP.home.setHomeMode('mini'); } catch (_) {} }
    // picaroja.com/paginaoficial ⇒ /?pr=1: se abre apenas la app tiene sesión.
    try {
        if (/[?&]pr=1\b/.test(location.search)) {
            let n = 0; const t = setInterval(() => { n++; if (VIP.state && VIP.state.currentToken && VIP.config) { clearInterval(t); open('inicio'); try { history.replaceState(null, '', location.pathname); } catch (_) {} } else if (n > 60) clearInterval(t); }, 500);
        }
    } catch (_) {}
    return { open, close, go, all, search, play, sport, load, support };
})();
