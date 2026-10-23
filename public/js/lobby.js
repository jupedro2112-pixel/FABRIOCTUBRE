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
    // #912: la misma página con otro estilo por marca (todas son puertas a la MISMA cuenta de Girox).
    const SKINS = {
        picaroja: { name: 'PICA ROJA', sub: 'Página exclusiva', logo: '/images/picaroja/logo-mono.svg', home: '/images/picaroja/logo-mono.svg', bar: '/icons/icon-192x192.png', cls: '', dir: '/images/picaroja/' },
        // #916 (owner: marca propia, jugaygana.io): diseño, banners y orden de colecciones de su inicio, con los juegos y la cuenta de Girox.
        jugaygana: { name: 'JUGAYGANA', sub: '', logo: '/images/jugaygana/io/logo.webp', home: '/images/jugaygana/icon.svg', bar: '/images/jugaygana/icon.svg', cls: 'prl-jyg prl-jio', dir: '/images/jugaygana/', wordmark: true, layout: 'jugaygana' },
        // #914 (owner: marca propia, ganandoargentina.com): diseño y orden de su página, con los juegos y la cuenta de Girox.
        ganamos: { name: 'Ganamos', sub: '', logo: '/images/ganamos/logo.webp', home: '/images/ganamos/ganamosDogIcon.webp', bar: '/images/ganamos/app-icon.png', cls: 'prl-gn', dir: '/images/ganamos/', wordmark: true, layout: 'ganamos' }
    };
    let _skin = 'picaroja';
    const SK = () => SKINS[_skin] || SKINS.picaroja;
    const BANNERS_OF = () => [[SK().dir + 'b1.svg', 'slots'], [SK().dir + 'b2.svg', 'vivo'], [SK().dir + 'b3.svg', 'deportes']];
    let _provOpen = false;
    function _shell() {
        const old = $('prLobby'); if (old && old.dataset.skin === _skin) return old; if (old) old.remove();
        const sk = SK();
        const nb = (v, k, t) => '<button type="button" data-v="' + v + '" onclick="VIP.lobby.go(\'' + v + '\')">' + ico(k) + '<span>' + t + '</span></button>';
        document.body.insertAdjacentHTML('beforeend',
            '<div id="prLobby" class="prl ' + sk.cls + '" data-skin="' + _skin + '" hidden role="dialog" aria-label="' + sk.name + '">' +
            // #914 (owner): arriba la MISMA barra que al entrar a Girox (Volver · Menú · marca · Historias · Info · Perfil).
            '<div class="casino-topbar prl-cbar">' + ((VIP.home && VIP.home.casinoBarHtml) ? VIP.home.casinoBarHtml({ back: 'VIP.lobby.close()', menu: 'VIP.home.casinoFullMenu()', logo: sk.bar, name: sk.name, idSuffix: 1 }) : '<div class="casino-topbar-row"><button type="button" class="casino-back" onclick="VIP.lobby.close()">‹ Volver</button></div>') + '</div>' +
            // #917 (owner): sin la fila de saldo / Cargar (se carga con la Carga rápida); JUGAYGANA y Ganamos mantienen su barra con el logo.
            (sk.wordmark ? '<header class="prl-top prl-top-logo"><button type="button" class="prl-brandbtn" onclick="VIP.lobby.go(\'inicio\')" aria-label="Inicio"><img src="' + sk.logo + '" alt="' + sk.name + '" class="prl-wordmark"></button>' +
                (sk.layout === 'jugaygana' ? '<button type="button" class="jg-burger" onclick="VIP.lobby.menu()" aria-label="Menú"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg></button>' : '') + '</header>' : '') +
            '<main class="prl-main" id="prlMain"></main>' +
            '<button type="button" class="prl-top-btn" id="prlUp" hidden onclick="VIP.lobby.top()" aria-label="Volver arriba">' + ico('up') + '</button>' +
            // #914: Carga rápida (mismo panel, CBU, comprobante y retiro que adentro del casino) con el logo de la marca.
            '<button type="button" class="prl-ql" onclick="VIP.home.toggleCasinoLoad()" title="Carga rápida"><img src="' + sk.bar + '" alt=""><span>CARGA RÁPIDA</span></button>' +
            (sk.layout === 'jugaygana' ? '' : sk.layout === 'ganamos'
                ? '<nav class="prl-nav" aria-label="Menú">' + nb('deportes', 'sport', 'Deporte') + nb('sorteos', 'star', 'Sorteos') +
                  '<button type="button" data-v="inicio" class="prl-home prl-dog" onclick="VIP.lobby.go(\'inicio\')"><img src="' + sk.home + '" alt=""><span>Inicio</span></button>' +
                  nb('slots', 'slots', 'Casino') + nb('vivo', 'live', 'Casino en vivo') + '</nav>'
                : '<nav class="prl-nav" aria-label="Menú">' + nb('slots', 'slots', 'Slots') + nb('vivo', 'live', 'En vivo') +
                  '<button type="button" data-v="inicio" class="prl-home" onclick="VIP.lobby.go(\'inicio\')"><img src="' + sk.home + '" alt=""><span>Inicio</span></button>' +
                  nb('deportes', 'sport', 'Deportes') + '<button type="button" data-v="menu" onclick="VIP.lobby.menu()">' + ico('menu') + '<span>Menú</span></button>' +
                  '</nav>') +
            '<div class="prl-drawer" id="prlDrawer" hidden onclick="if(event.target===this)VIP.lobby.menu(false)"><aside class="prl-dr" role="dialog" aria-label="Mi cuenta"><div id="prlDrBody"></div></aside></div>' +
            '</div>');
        return $('prLobby');
    }
    function _balText() { try { const src = $('userBalance'); return src && src.textContent ? src.textContent.replace(/^\s*Saldo:?\s*/i, '') : '—'; } catch (_) { return '—'; } }
    function _paintBal() {
        try { const b = $('prlBal'); if (b) b.textContent = _balText(); } catch (_) {}
    }
    function _card(g) {
        return '<button type="button" class="prl-g" onclick="VIP.lobby.play(\'' + esc(g.key) + '\', this)" data-name="' + esc(g.name) + '" title="' + esc(g.name) + '" aria-label="' + esc(g.name) + '">' +
            '<span class="prl-gi">' + (g.img ? '<img loading="lazy" decoding="async" src="' + esc(img(g.img)) + '" alt="" onerror="this.remove()">' : '') + (g.isNew ? '<em class="prl-new">NUEVO</em>' : '') + '<i>' + esc(g.name) + '</i></span></button>';
    }
    function _title(icon, title, onclick) {
        return '<div class="prl-sh">' + (onclick ? '<button type="button" class="prl-st" onclick="' + onclick + '">' : '<span class="prl-st">') + ico(icon) + '<h3>' + esc(title) + '</h3>' + (onclick ? '<b class="prl-chev">›</b></button>' : '</span>') + '</div>';
    }
    // #909: secciones como Stake: de a 4 por fila (#911); "Ver más" despliega de a 8 (el orden de los juegos es el de Girox: más jugados primero).
    let _secN = 0;
    function _row(icon, title, games, providerId) {
        if (!games || !games.length) return '';
        const id = 'prlS' + (++_secN);
        return '<section class="prl-sec">' + _title(icon, title, providerId ? 'VIP.lobby.all(' + Number(providerId) + ', \'' + esc(title).replace(/'/g, '') + '\')' : null) +
            '<div class="prl-grid prl-g3" id="' + id + '" data-show="8">' + games.map((g, i) => _card(g).replace('class="prl-g"', 'class="prl-g' + (i >= 8 ? ' prl-hid' : '') + '"')).join('') + '</div>' +
            (games.length > 8 ? '<div class="prl-more"><button type="button" onclick="VIP.lobby.more(\'' + id + '\', this)">Ver más</button></div>' : '') + '</section>';
    }
    function more(id, btn) {
        const box = $(id); if (!box) return;
        const hid = box.querySelectorAll('.prl-hid'); for (let i = 0; i < Math.min(8, hid.length); i++) hid[i].classList.remove('prl-hid');
        if (box.querySelectorAll('.prl-hid').length === 0 && btn) btn.closest('.prl-more').remove();
    }
    function _hero() {
        if (SK().layout === 'ganamos') return _gnPromos(false);
        if (SK().layout === 'jugaygana') return '';
        return '<div class="prl-hero" id="prlHero">' + BANNERS_OF().map((b) => '<button type="button" class="prl-slide" onclick="VIP.lobby.go(\'' + b[1] + '\')"><img src="' + b[0] + '" alt="' + SK().name + '" decoding="async"></button>').join('') + '</div>';
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
    // ===== #914 Ganamos: mismo orden que su página (promos/sorteos arriba, accesos Casino / Casino en vivo, 3 juegos + Deporte,
    // Depósito · Retiro · Chat, y filas deslizantes de a 4: Especialmente para vos, Primicias, Rubyplay, Amusnet, Pragmatic, Amigo Gaming,
    // XPG, Destacadas, Del Joker, Clásicas, Pragmatic Live). Lo que en su página es exclusivo de su sistema (juegos propios, torneos,
    // sorteos) acá queda como "PRÓXIMAMENTE" hasta tener su API.
    // #917 (owner): arriba de cada página, los DOS sorteos (el mensual activo y el Gran Sorteo "próximamente"), con el estilo de la marca.
    function _rfStrip() { // #919: recuadro chico con cuenta regresiva y 3 trofeos (VIP.raffle.stripHtml), con los colores de la marca
        try { return VIP.raffle.stripHtml(_skin); } catch (_) { return ''; }
    }
    const GN_PROMOS = [['promo-betrace.webp', 'Torneo de Betrace'], ['promo-endorphina.webp', 'Los tesoros de Endorphina'], ['promo-ruby.webp', 'Rubyplay'], ['promo-winspinity.webp', 'El camino de la fortuna']];
    function _gnPromos(big) {
        if (!big) return _rfStrip(); // #917: en el inicio de Ganamos van sólo los dos sorteos (las promos de torneos se sacaron)
        return '<div class="gn-promos' + (big ? ' big' : '') + '">' + GN_PROMOS.map((p) => '<button type="button" class="gn-promo" onclick="VIP.lobby.go(\'sorteos\')" aria-label="' + p[1] + ' · próximamente"><img src="' + SK().dir + p[0] + '" alt=""><em>PRÓXIMAMENTE</em></button>').join('') + '</div>';
    }
    let _gcN = 0;
    function _gcar(title, games, onclick) {
        if (!games || !games.length) return '';
        const id = 'gnC' + (++_gcN); const pages = Math.ceil(Math.min(games.length, 24) / 4);
        return '<section class="gn-sec"><div class="gn-sh"><span>' + esc(title) + '</span>' + (onclick ? '<button type="button" onclick="' + onclick + '">Ver todo ›</button>' : '') + '</div>' +
            '<div class="gn-car" id="' + id + '" onscroll="VIP.lobby.gcarScroll(this)">' + games.slice(0, 24).map((g) => '<button type="button" class="gn-g" onclick="VIP.lobby.play(\'' + esc(g.key) + '\', this)" data-name="' + esc(g.name) + '" aria-label="' + esc(g.name) + '"><span>' + (g.img ? '<img loading="lazy" decoding="async" src="' + esc(img(g.img)) + '" alt="" onerror="this.remove()">' : '') + '<i>' + esc(g.name) + '</i></span></button>').join('') + '</div>' +
            (pages > 1 ? '<div class="gn-bars" data-for="' + id + '">' + Array.from({ length: pages }, (_, i) => '<i class="' + (i ? '' : 'on') + '"></i>').join('') + '</div>' : '') + '</section>';
    }
    function gcarScroll(el) {
        const bars = document.querySelector('.gn-bars[data-for="' + el.id + '"]'); if (!bars) return;
        const n = bars.children.length; const i = Math.min(n - 1, Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
        [...bars.children].forEach((b, k) => b.classList.toggle('on', k === i));
    }
    const _provId = (re) => { const p = ((_data && _data.providers) || []).find((x) => re.test(x.name)); return p ? p : null; };
    // #915 (owner: "cada proveedor con su juego correspondiente, en el mismo orden"): las filas salen de /data/ganamos-home.json = las listas
    // FIJAS del inicio de Ganamos, en su orden, con los juegos de Girox que coinciden en nombre y proveedor (lo que Girox no tiene NO se
    // reemplaza: la fila queda más corta o no aparece). "Especialmente para vos" en Ganamos es personal (su API): acá van los más jugados de Girox.
    const GN_MORE = { 'Rubyplay': /ruby/i, 'Amusnet': /amusnet|egt/i, 'Pragmatic Slots': /^pragmatic play$/i, 'Pragmatic Live': /pragmatic.*live/i };
    let _gnHomeData = null;
    async function _gnData() {
        if (_gnHomeData) return _gnHomeData;
        try { const r = await fetch('/data/ganamos-home.json', { cache: 'no-cache' }); if (r.ok) _gnHomeData = await r.json(); } catch (_) {}
        return _gnHomeData || { tiles: [], rows: [] };
    }
    function _gnHome() {
        const pop = (_data && _data.popular) || [];
        const tiles = (_gnHomeData && _gnHomeData.tiles) || [];
        return _gnPromos(false) +
            '<div class="gn-links"><button type="button" class="gn-link" onclick="VIP.lobby.go(\'slots\')"><img src="' + SK().dir + 'casino-original.webp" alt=""><b>Casino</b><span>Diversión sin límites ›</span></button>' +
            '<button type="button" class="gn-link" onclick="VIP.lobby.go(\'vivo\')"><img src="' + SK().dir + 'livecasino-original.webp" alt=""><b>Casino en vivo</b><span>Jugá con crupieres en vivo ›</span></button></div>' +
            (tiles.length ? '<div class="gn-tiles">' + tiles.map((g) => '<button type="button" class="gn-tile" onclick="VIP.lobby.play(\'' + esc(g.key) + '\', this)" data-name="' + esc(g.name) + '" aria-label="' + esc(g.name) + '">' + (g.img ? '<img src="' + esc(img(g.img)) + '" alt="">' : '<i>' + esc(g.name) + '</i>') + '</button>').join('') + '</div>' : '') +
            '<button type="button" class="gn-sport" onclick="VIP.lobby.go(\'deportes\')">⚽ Deportes</button>' +
            '<div class="gn-pay"><button type="button" onclick="VIP.lobby.load()">💳 Depósito</button><button type="button" onclick="VIP.lobby.withdraw()">💸 Retiro de dinero</button></div>' +
            '<button type="button" class="gn-chat" onclick="VIP.lobby.support()">💬 Chat</button>' +
            _gcar('Especialmente para vos', pop, 'VIP.lobby.go(\'slots\')') +
            '<div id="gnRows">' + _gnRowsHtml() + '</div>';
    }
    function _gnRowsHtml() {
        if (!_gnHomeData) return '';
        return (_gnHomeData.rows || []).map((r) => { const re = GN_MORE[r.title]; const pv = re ? _provId(re) : null; return _gcar(r.title, r.games, pv ? 'VIP.lobby.all(' + Number(pv.id) + ', \'' + esc(r.title) + '\')' : 'VIP.lobby.go(\'slots\')'); }).join('');
    }
    async function _gnFillRows() {
        if (_gnHomeData) return;
        await _gnData(); const b = $('gnRows');
        if (b && _skin === 'ganamos' && _view === 'inicio') { _gcN = 100; b.innerHTML = _gnRowsHtml(); const m = $('prlMain'); if (m && (_gnHomeData.tiles || []).length && !m.querySelector('.gn-tiles')) _render(); }
    }
    // ===== #916 JUGAYGANA (jugaygana.io): mismo orden que su inicio en el celular — carrusel (11 banners, cada 5 s) · buscador + Proveedores
    // · Eventos deportivos · colecciones (en su orden, 2 filas deslizables, tarjetas cuadradas) · Casino en Vivo (4) · portadas Casino / Casino en
    // Vivo / Eventos deportivos. Sin barra de abajo (su página no la tiene). Datos: /data/jugaygana-home.json (juegos cruzados con Girox por
    // nombre y proveedor; lo que Girox no tiene no aparece).
    let _jgHomeData = null, _jgTimer = null, _jgSlide = 0, _allCat = null;
    async function _jgData() {
        if (_jgHomeData) return _jgHomeData;
        try { const r = await fetch('/data/jugaygana-home.json', { cache: 'no-cache' }); if (r.ok) _jgHomeData = await r.json(); } catch (_) {}
        return _jgHomeData;
    }
    function _jgCard(g) { // #918: como su tarjeta: imagen cuadrada, el nombre abajo sobre un degradé
        return '<button type="button" class="jg-card" onclick="VIP.lobby.play(\'' + esc(g.key) + '\', this)" data-name="' + esc(g.name) + '" aria-label="' + esc(g.name) + '"><span>' + (g.img ? '<img loading="lazy" decoding="async" src="' + esc(img(g.img)) + '" alt="" onerror="this.remove()">' : '') + '<em><b>' + esc(g.name) + '</b></em></span></button>';
    }
    function jgArrow(btn, dir) { const row = btn.parentNode && btn.parentNode.querySelector('.jg-row'); if (row) { try { row.scrollBy({ left: dir * row.clientWidth * 0.9, behavior: 'smooth' }); } catch (_) { row.scrollLeft += dir * row.clientWidth * 0.9; } } }
    // #918: barra de categorías (sus íconos y su orden). TORNEOS = el sorteo; el resto = catálogo de Girox (búsqueda u orden).
    function jgCat(key) {
        const it = ((_jgHomeData && _jgHomeData.catnav) || []).find((x) => x.key === key); if (!it) return;
        if (it.home) { go('inicio'); return; }
        if (it.raffle) { try { VIP.raffle.open('jugaygana'); } catch (_) {} return; }
        _allProv = null; _allCat = { label: it.label, q: it.q || '', sort: it.sort || '', key }; _view = 'all'; _render(); const m = $('prlMain'); if (m) m.scrollTop = 0;
    }
    function _jgCatnav(active) {
        const items = (_jgHomeData && _jgHomeData.catnav) || []; if (!items.length) return '';
        return '<nav class="jg-catnav" aria-label="Categorías"><div class="jg-catnav-s">' + items.map((it) => '<button type="button" class="jg-catnav-i' + (it.key === active ? ' on' : '') + '" onclick="VIP.lobby.jgCat(\'' + it.key + '\')"><span class="jg-catnav-ic"><svg viewBox="0 0 24 24" width="24" height="24" fill="none">' + it.svg + '</svg></span><span class="jg-catnav-l">' + esc(it.label) + '</span></button>').join('') + '</div><div class="jg-catnav-t"><i></i></div></nav>';
    }
    function _jgHome() {
        const d = _jgHomeData || {};
        const slides = d.slides || [];
        const t = (x) => '<h2 class="jg-t">' + esc(x) + '</h2>';
        const cols = (d.collections || []).map((c) => {
            const games = c.games || []; const n = Math.min(5, Math.max(1, Number(c.rows) || 1)); const per = Math.ceil(games.length / n); const rows = [];
            for (let i = 0; i < n; i++) { const part = games.slice(i * per, (i + 1) * per); if (part.length) rows.push(part); }
            return '<section class="jg-sec' + (c.bg ? ' jg-sec-bg' : '') + '">' + (c.bg ? '<img class="jg-sec-bgi" src="' + esc(c.bg) + '" alt="" loading="lazy">' + (c.art ? '<img class="jg-sec-art" src="' + esc(c.art) + '" alt="" loading="lazy">' : '') : '') +
                '<div class="jg-sec-h"><div><h2 class="jg-st">' + esc(c.title) + '</h2><span class="jg-line"></span></div><button type="button" class="jg-all" onclick="VIP.lobby.go(\'slots\')">Mostrar Todo</button></div>' +
                '<div class="jg-rows">' + rows.map((r) => '<div class="jg-rowwrap"><button type="button" class="jg-arr jg-arr-l" onclick="VIP.lobby.jgArrow(this,-1)" aria-label="Anteriores">‹‹</button><div class="jg-row">' + r.map(_jgCard).join('') + '</div><button type="button" class="jg-arr jg-arr-r" onclick="VIP.lobby.jgArrow(this,1)" aria-label="Siguientes">››</button></div>').join('') + '</div></section>';
        }).join('');
        return _rfStrip() + (slides.length ? '<section class="jg-slider"><div class="jg-slides" id="jgSlides" onscroll="VIP.lobby.jgSlideScroll(this)">' + slides.map((b) => '<div class="jg-slide"><img src="' + esc(b.img) + '" alt="" decoding="async" style="object-fit:' + (b.fit === 'contain' ? 'contain' : 'cover') + '"></div>').join('') + '</div>' +
                '<div class="jg-dots" id="jgDots">' + slides.map((_, i) => '<i class="' + (i ? '' : 'on') + '"></i>').join('') + '</div></section>' : '') +
            '<div class="jg-wrap"><div class="jg-searchrow"><label class="jg-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="M20 20l-4-4" stroke="currentColor" stroke-width="2"/></svg><input type="search" placeholder="Buscar juegos" value="' + esc(_q) + '" oninput="VIP.lobby.search(this.value)"></label>' +
            '<button type="button" class="jg-provbtn" onclick="VIP.lobby.jgProv(true)"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1" fill="currentColor"/><rect x="14" y="3" width="7" height="7" rx="1" fill="currentColor"/><rect x="3" y="14" width="7" height="7" rx="1" fill="currentColor"/><rect x="14" y="14" width="7" height="7" rx="1" fill="currentColor"/></svg>Proveedores</button></div>' + _jgCatnav('inicio') + '<div id="prlRes"></div>' +
            '<section class="jg-sec">' + t('Eventos deportivos') + '<div class="jg-sports">' + ((_data && _data.sports) || []).map((sp) => '<button type="button" onclick="VIP.lobby.sport(\'' + esc(sp.path) + '\')"><b>' + esc(sp.title) + '</b><small>' + esc(sp.sub) + '</small></button>').join('') + '</div></section>' +
            cols +
            ((d.live || []).length ? '<section class="jg-sec">' + t('Casino en Vivo') + '<div class="jg-live">' + d.live.map((l) => '<button type="button" onclick="VIP.lobby.go(\'vivo\')" aria-label="' + esc(l.label) + '"><img src="' + esc(l.img) + '" alt="' + esc(l.label) + '" loading="lazy"></button>').join('') + '</div></section>' : '') +
            ((d.covers || []).length ? '<div class="jg-covers">' + d.covers.map((c) => '<button type="button" class="jg-cover" onclick="VIP.lobby.go(\'' + esc(c.view) + '\')"><img src="' + esc(c.img) + '" alt="" loading="lazy"><span>' + esc(c.label) + '</span></button>').join('') + '</div>' : '') +
            '</div>' +
            '<div class="jg-provsheet" id="jgProv" hidden onclick="if(event.target===this)VIP.lobby.jgProv(false)"><div class="jg-provmodal"><div class="jg-provtop"><button type="button" onclick="VIP.lobby.jgProv(false)">CERRAR</button></div><div class="jg-provlist">' +
            ((_data && _data.providers) || []).filter((p) => !p.live).map((p) => '<button type="button" onclick="VIP.lobby.jgProv(false);VIP.lobby.all(' + Number(p.id) + ', \'' + esc(p.name).replace(/'/g, '') + '\')"><span>' + esc(p.name) + '</span><small>' + Number(p.count || 0) + '</small></button>').join('') + '</div></div></div>';
    }
    function jgSlideScroll(el) { const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth)); _jgSlide = i; const d = $('jgDots'); if (d) [...d.children].forEach((b, k) => b.classList.toggle('on', k === i)); }
    function _jgAuto() {
        clearInterval(_jgTimer);
        _jgTimer = setInterval(() => { const el = $('jgSlides'); if (!el || !el.isConnected) { clearInterval(_jgTimer); return; } const n = el.children.length; if (!n) return; _jgSlide = (_jgSlide + 1) % n; try { el.scrollTo({ left: _jgSlide * el.clientWidth, behavior: 'smooth' }); } catch (_) { el.scrollLeft = _jgSlide * el.clientWidth; } }, 5000);
    }
    function jgProv(show) { const s2 = $('jgProv'); if (s2) s2.hidden = !show; }
    function _render() {
        const m = $('prlMain'); if (!m) return; _secN = 0;
        document.querySelectorAll('.prl-nav [data-v]').forEach((b) => b.classList.toggle('on', b.dataset.v === _view || (_view === 'all' && b.dataset.v === 'slots')));
        if (_view === 'sorteos') { _view = 'inicio'; try { VIP.raffle.open(_skin); } catch (_) {} } // #917: la pestaña Sorteos abre el sorteo mensual
        if (!_data) { m.innerHTML = (SK().layout === 'ganamos' ? _gnPromos(false) : _hero()) + '<div class="prl-note">Cargando los juegos…</div>'; return; }
        if (SK().layout === 'ganamos' && _view === 'inicio') { _gcN = 0; m.innerHTML = _gnHome(); _gnFillRows(); return; }
        if (SK().layout === 'jugaygana' && _view === 'inicio') {
            if (!_jgHomeData) { m.innerHTML = '<div class="prl-note">Cargando…</div>'; _jgData().then(() => { if (_skin === 'jugaygana' && _view === 'inicio') _render(); }); return; }
            m.innerHTML = _jgHome(); _jgSlide = 0; _jgAuto(); if (_q) search(_q); return;
        }
        if (_view === 'deportes') {
            m.innerHTML = _title('sport', 'Deportes', null) + '<div class="prl-sports">' + (_data.sports || []).map((s, i) => '<button type="button" class="prl-sport" onclick="VIP.lobby.sport(\'' + esc(s.path) + '\')"><img src="' + (SK().layout === 'ganamos' ? SK().dir + 'casino-bg.png' : SK().dir + 'b3.svg') + '" alt="" class="prl-sport-bg' + (i ? ' alt' : '') + '"><span><b>' + esc(s.title) + '</b><small>' + esc(s.sub) + '</small></span></button>').join('') + '</div><p class="prl-note">Entrás con tu misma cuenta y tu saldo.</p>';
            return;
        }
        if (_view === 'vivo') {
            m.innerHTML = _title('live', 'Casino en vivo', null) + ((_data.live || []).map((s) => _row('live', s.title, s.games, s.providerId)).join('') || '<div class="prl-note">No hay mesas en vivo para mostrar ahora.</div>') +
                _providers((_data.providers || []).filter((p) => p.live));
            return;
        }
        if (_view === 'slots' || _view === 'all') {
            if (_view === 'slots' || _allProv) _allCat = null;
            if (_allCat && SK().layout === 'jugaygana') { // #918: categoría de la barra de JUGAYGANA (su barra sigue arriba)
                m.innerHTML = '<div class="jg-wrap">' + _jgCatnav(_allCat.key) + '<div class="jg-sec-h jg-cat-h"><div><h2 class="jg-st">' + esc(_allCat.label) + '</h2><span class="jg-line"></span></div></div></div><div class="prl-grid jg-grid" id="prlAll"></div><div class="prl-note" id="prlAllMore">Cargando…</div>';
                _allPage = 0; _allMore = true; _moreAll(); return;
            }
            const t = _allProv ? _allProv.name : 'Slots · todos los juegos';
            m.innerHTML = '<div class="prl-sh"><span class="prl-st">' + ico('slots') + '<h3>' + esc(t) + '</h3></span>' + (_allProv ? '<button type="button" class="prl-back" onclick="VIP.lobby.all(null)">Ver todos</button>' : '') + '</div>' +
                (_allProv ? '' : _search()) + '<div class="prl-grid" id="prlAll"></div><div class="prl-note" id="prlAllMore">Cargando…</div>';
            _allPage = 0; _allMore = true; _moreAll(); if (_q && !_allProv) search(_q); return;
        }
        m.innerHTML = _rfStrip() + _hero() + _providers(_data.providers) + _search() +
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
            const r = await fetch(VIP.config.API_URL + '/api/games/catalog?page=' + _allPage + (_allProv ? '&provider=' + _allProv.id : '') + (_allCat && _allCat.q ? '&q=' + encodeURIComponent(_allCat.q) : '') + (_allCat && _allCat.sort ? '&sort=' + _allCat.sort : ''), { headers: auth() });
            const d = await r.json().catch(() => ({}));
            const box = $('prlAll'); if (!box) return;
            if (r.ok) { box.insertAdjacentHTML('beforeend', (d.games || []).map(SK().layout === 'jugaygana' ? _jgCard : _card).join('')); _allMore = !!d.hasMore; }
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
    function open(view, skin) {
        _skin = SKINS[skin] ? skin : 'picaroja';
        const el = _shell(); el.hidden = false; document.body.classList.add('prl-open', 'casino-open'); // #914: modales (Perfil, Info, Retiro…) arriba de la página
        _view = view || 'inicio'; _render(); _paintBal(); setTimeout(() => { try { VIP.raffle.tick(); } catch (_) {} }, 0); // #919: cuenta regresiva del sorteo al toque
        clearInterval(_balTimer); _balTimer = setInterval(_paintBal, 5000);
        const m = $('prlMain'); if (m && !m._prlScroll) { m._prlScroll = true; m.addEventListener('scroll', _onScroll, { passive: true }); }
        if (!_data) _load();
    }
    function close() {
        const el = $('prLobby'); if (el) el.hidden = true; document.body.classList.remove('prl-open'); clearInterval(_balTimer); clearInterval(_jgTimer);
        try { if (!(VIP.ui && VIP.ui._casinoOpen)) document.body.classList.remove('casino-open'); const p = $('casinoLoadPanel'); if (p && el && el.contains(p)) p.style.display = 'none'; if (VIP.home.casinoQuickClose && el && el.contains(p)) VIP.home.casinoQuickClose(); } catch (_) {}
    }
    function go(view) { if (view === 'slots') _allProv = null; if (view !== 'all') _allCat = null; _view = view; _render(); const m = $('prlMain'); if (m) m.scrollTop = 0; }
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
            '<div class="prl-dr-head"><img src="' + SK().home + '" alt="" class="prl-logo"><div><b>' + esc(u.username || 'Mi cuenta') + '</b><small>' + SK().name + (SK().sub ? ' · ' + SK().sub : '') + '</small></div><button type="button" class="prl-x" onclick="VIP.lobby.menu(false)" aria-label="Cerrar">✕</button></div>' +
            '<div class="prl-dr-card"><small>Saldo</small><b class="prl-dr-bal">' + esc(_balText()) + '</b>' +
            '<div class="prl-dr-btns"><button type="button" class="prl-load" onclick="VIP.lobby.load()">Cargar</button><button type="button" class="prl-ghost" onclick="VIP.lobby.withdraw()">Retirar</button></div></div>' +
            '<div class="prl-dr-card"><small>Nivel y rango</small>' +
            (lv ? '<b class="prl-dr-lvl">' + esc(lv.emoji || '') + ' ' + esc(lv.name) + '</b>' : '<b class="prl-dr-lvl">Jugador</b><span class="prl-dr-sub">Todavía sin nivel</span>') +
            (nx ? '<div class="prl-bar"><i style="width:' + pct + '%"></i></div><span class="prl-dr-sub">' + pct + '% · te faltan ' + money(v.faltaParaSubir) + ' apostados para ' + esc((nx.emoji || '') + ' ' + nx.name) + '</span>' : (lv ? '<span class="prl-dr-sub">Nivel máximo</span>' : '')) + '</div>' +
            '<div class="prl-dr-list">' + item('chat', 'Soporte', 'VIP.lobby.support()') + item('home', 'Mi perfil', 'VIP.lobby.profile()') + item('slots', 'Volver a la app', 'VIP.lobby.close()') + '</div>';
    }
    function withdraw() { menu(false); try { VIP.withdraw.openWithdrawModal(); } catch (_) {} } // #914: el modal va arriba de la página (body.casino-open)
    function profile() { menu(false); try { VIP.home.openProfile(); } catch (_) {} }
    function top() { const m = $('prlMain'); if (m) m.scrollTo ? m.scrollTo({ top: 0, behavior: 'smooth' }) : (m.scrollTop = 0); }
    function load() { menu(false); try { VIP.home.toggleCasinoLoad(true); return; } catch (_) {} close(); try { VIP.home.setHomeMode('full'); } catch (_) {} } // #914: Carga rápida sobre la página
    function support() { menu(false); close(); try { VIP.home.setHomeMode('mini'); } catch (_) {} }
    // picaroja.com/paginaoficial ⇒ /?pr=1: se abre apenas la app tiene sesión.
    try {
        const _auto = /[?&]pr=1\b/.test(location.search) ? 'picaroja' : /[?&]jg=1\b/.test(location.search) ? 'jugaygana' : /[?&]gn=1\b/.test(location.search) ? 'ganamos' : null; // #912 /jugaygana ⇒ ?jg=1 · #914 /ganamosoficial ⇒ ?gn=1
        if (_auto) {
            let n = 0; const t = setInterval(() => { n++; if (VIP.state && VIP.state.currentToken && VIP.config) { clearInterval(t); try { VIP.home.openPlatform(_auto); } catch (_) { open('inicio', _auto); } try { history.replaceState(null, '', location.pathname); } catch (_) {} } else if (n > 60) clearInterval(t); }, 500);
        }
    } catch (_) {}
    return { open, close, go, all, provToggle, more, menu, withdraw, profile, top, search, play, sport, load, support, gcarScroll, jgSlideScroll, jgProv, jgCat, jgArrow, skin: () => _skin };
})();
