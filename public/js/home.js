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
    // #366 (owner): cuarto modo **easy** = MENÚ FÁCIL ("para la gente que se pierde con tantos botones"): saldo,
    //       CARGAR AHORA, reembolso / ruleta / referidos / ver la plataforma, ayuda por chat. La preferencia
    //       (fácil o completo) vive en localStorage vip_menu_pref; se elige en #menuChooser al entrar la primera
    //       vez y se cambia desde Perfil (o con los links de abajo de cada menú). "Inicio" respeta la preferencia.
    const HOME_MODE_KEY = 'vip_home_mode';
    const HOME_BANNER_KEY = 'vip_home_banner';
    const MENU_PREF_KEY = 'vip_menu_pref';
    // #635 (owner): qué menús puede elegir la gente (panel → Elegir menú → "Menús activos"); llega en /api/public/menu-layout
    // (Config['menusEnabled']) y se recuerda en localStorage para aplicarlo al instante al arrancar (sin "viejo y después nuevo").
    const MENUS_ON_KEY = 'vip_menus_on'; const MENU_ORDER = ['full', 'basic', 'easy', 'girox']; // #636: el completo es el predeterminado · #670: + Girox directo
    let _menusOn = { basic: true, easy: true, full: true, girox: true };
    let _curPref = null; // #670: preferencia vigente (para distinguir 'girox' del completo, que comparten el modo play)
    try { const c = JSON.parse(localStorage.getItem(MENUS_ON_KEY) || 'null'); if (c && typeof c === 'object') _menusOn = { basic: c.basic !== false, easy: c.easy !== false, full: c.full !== false, girox: c.girox !== false }; } catch (_) {}
    function _menuOn(p) { return _menusOn[p] !== false; }
    function _firstMenuOn() { return MENU_ORDER.find(_menuOn) || 'basic'; }
    function _applyMenusEnabled(m) {
        if (m && typeof m === 'object') {
            _menusOn = { basic: m.basic !== false, easy: m.easy !== false, full: m.full !== false, girox: m.girox !== false };
            if (!MENU_ORDER.some(_menuOn)) _menusOn = { basic: true, easy: true, full: true, girox: true };
            try { localStorage.setItem(MENUS_ON_KEY, JSON.stringify(_menusOn)); } catch (_) {}
        }
        MENU_ORDER.forEach((p) => document.body.classList.toggle('no-menu-' + p, !_menuOn(p)));
        const on = MENU_ORDER.filter(_menuOn); document.body.classList.toggle('menus-one', on.length === 1);
        try {
            if (on.length === 1) { const ch = _el('menuChooser'); if (ch && ch.classList.contains('open')) setMenuPref(on[0], { quiet: true }); }
            if (_homeMode && (_homeMode === 'basic' || _homeMode === 'easy' || _homeMode === 'play') && !_menuOn(_prefOfMode())) setHomeMode(_modeFor(getMenuPref()), { persist: false });
        } catch (_) {}
    }
    const MENU_FIXED_KEY = 'vip_menu_fixed'; // #559: '1' = el menú guardado es el del ingreso (no se vuelve a preguntar)
    function isMenuFixed() { try { return localStorage.getItem(MENU_FIXED_KEY) === '1'; } catch (_) { return false; } }
    let _homeMode = 'play';
    let _easyTimer = null;
    let _easyRefLoaded = false;
    let _headObs = null;

    function getHomeMode() { return _homeMode; }
    function setHomeMode(mode, opts) {
        _applyMenuLayout(); // #482
        setTimeout(function () { try { loadStrategy(false); } catch (_) {} }, 600); // #504
        // #596 (owner, limpieza): sin el popup de primera carga (queda el cartel chico del Inicio, #564) // #488: la opción de menú (barra abajo) aplica en TODOS los modos (fácil y completo)
        mode = (mode === 'full' || mode === 'mini' || mode === 'easy' || mode === 'basic') ? mode : 'play'; // #512: basic
        _homeMode = mode;
        const p = _el('supportPanel');
        const cta = _el('serviceBannerCta');
        const bn = _el('serviceBanner');
        document.body.classList.toggle('home-mini', mode === 'mini');
        document.body.classList.toggle('home-play', mode === 'play');
        document.body.classList.toggle('home-full', mode === 'full'); // #269: carga automática SENCILLA (CSS esconde lo demás)
        document.body.classList.toggle('home-easy', mode === 'easy' || mode === 'basic'); // #366: MENÚ FÁCIL (#512: básico reusa el ocultado)
        document.body.classList.toggle('home-basic', mode === 'basic'); // #512
        // #569: la etiqueta "· Completo" de Cambiar menú se sacó (no entraba con Racha)
        // #637 (owner): nivel VIP + fueguito en la LÍNEA DE ESTADO (#statusRow) arriba de todo del Inicio (play); en el básico el nivel
        // va al lado de "Cambiar menú" (#627) y la racha ya está en la línea del saldo; en los demás modos no se muestran.
        try {
            const sr = _el('statusRow'), tr = _el('topRow'), vm = _el('vipMiniBtn'), fm = _el('fireMiniBtn');
            if (mode === 'play') { if (sr) { if (vm) sr.appendChild(vm); if (fm) sr.appendChild(fm); } if (vm) vm.hidden = false; if (fm) fm.hidden = false; }
            else if (mode === 'basic') { if (tr && vm) tr.appendChild(vm); if (vm) vm.hidden = false; if (fm) fm.hidden = true; }
            else { if (vm) vm.hidden = true; if (fm) fm.hidden = true; }
            if (sr) sr.hidden = mode !== 'play';
            _fireMiniSync();
        } catch (_) {}
        try { _paintMenuPin(); } catch (_) {} // #559
        clearInterval(_easyTimer); _easyTimer = null;
        document.body.classList.remove('support-open');
        _paintNav();
        if (mode === 'play') {
            if (p) p.classList.add('hidden');
            _open = false;
            try { const bb = _el('supportBubble'); if (bb) bb.style.visibility = ''; } catch (_) {}
            try { const i = _el('messageInput'); if (i) i.blur(); } catch (_) {}
            renderEntryTabs();
            _entryLoad();
        } else if (mode === 'easy' || mode === 'basic') {
            _entryUnload();
            if (p) p.classList.add('hidden');
            _open = false;
            try { const i = _el('messageInput'); if (i) i.blur(); } catch (_) {}
            _easyPaint(); if (mode === 'basic') _basicPaint();
            _easyTimer = setInterval(() => { if (!document.hidden && (_homeMode === 'easy' || _homeMode === 'basic')) { _easyPaint(); if (_homeMode === 'basic') _basicPaint(); } }, 15000);
        } else {
            _entryUnload();
        }
        if (mode === 'mini') {
            if (p) p.classList.remove('hidden');
            _open = true; _unread = 0; _paintBadge();
            if (cta) cta.textContent = 'Ir a carga automática ›';
            if (bn) { bn.setAttribute('aria-expanded', 'false'); bn.title = 'Ver la app completa'; }
            try { VIP.chat.markReceivedAsRead(); } catch (_) {}
            setTimeout(() => { try { VIP.chat.scrollToBottom(); } catch (_) {} }, 80);
            // #373 (owner): el chat ya no es "Carga manual" sino SOPORTE: no se manda el CBU solo (#365 se sacó);
            // Martín se presenta en la tarjeta de arriba (#supportIntro) y el cliente cuenta su caso.
            try { _paintSupportIntro(_platforms && _platforms.supportIntro); } catch (_) {}
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
        Object.keys(map).forEach((id) => { const b = _el(id); if (b) b.classList.toggle('active', map[id] === _homeMode || (id === 'navInicio' && _homeMode === 'easy')); });
    }
    // ---------------- #366: MENÚ FÁCIL / COMPLETO ----------------
    function getMenuPref() { try { const v = localStorage.getItem(MENU_PREF_KEY); const p = (v === 'easy' || v === 'full' || v === 'basic' || v === 'girox') ? v : null; return (p && !_menuOn(p)) ? _firstMenuOn() : p; } catch (_) { return null; } } // #512: + basic · #635: si está deshabilitado, el primero activo
    const _modeFor = (pref) => (pref === 'easy' ? 'easy' : (pref === 'basic' ? 'basic' : (pref === 'girox' ? 'play' : (_menuOn('full') ? 'play' : (_firstMenuOn() === 'easy' ? 'easy' : 'basic'))))); // #670: girox = Inicio + casino abierto
    // #670 (owner): MENÚ "GIROX DIRECTO": abre la plataforma ADENTRO de la app (con sesión) y el panel de Carga rápida (datos +
    // adjuntar + Retirar). Se usa al elegir el menú, al entrar con ese menú fijo y al tocar Inicio.
    function _giroxDirect() {
        try { if (VIP.ui && VIP.ui._casinoOpen) return; } catch (_) {}
        // #672 (owner): abre Girox porque es la plataforma seleccionada; cuando haya otras con API, abre la preferida del cliente.
        setTimeout(() => { try { const list = (_platforms && _platforms.platforms) || []; const pref = _platforms && _platforms.preferredPlatform; const pp = list.find((x) => x.id === pref && x.connected); openPlatform(pp ? pp.id : 'girox', { embed: true }); } catch (_) {} }, 350);
    }
    function _afterPref(pref) { _curPref = pref; if (pref === 'girox') _giroxDirect(); }
    // "Inicio" de la barra: menú fácil o completo según lo que eligió la persona.
    // #519 (owner): el botón INICIO es donde cada uno elige su tipo de menú. Si ya estás en el Inicio, abre el selector
    // (Básico · Fácil · Completo); si venías del chat u otra pantalla, primero te lleva al Inicio.
    function goHome() {
        // #539 (owner): INICIO va SIEMPRE al inicio del menú ya elegido (sin abrir el selector; para cambiar está "Cambiar menú").
        // #588 (owner): en el básico, INICIO cierra los paneles desplegados (CARGAR / RETIRAR).
        try {
            const lp = _el('bvLoadPanel'), wp = _el('bvWdPanel'); const lb = document.querySelector('#basicView .bv-load'), wb = document.querySelector('#basicView .bv-wd');
            if (lp) lp.hidden = true; if (wp) wp.hidden = true; if (lb) lb.setAttribute('aria-expanded', 'false'); if (wb) wb.setAttribute('aria-expanded', 'false');
        } catch (_) {}
        setHomeMode(_modeFor(getMenuPref()));
        _afterPref(getMenuPref()); // #670: con Girox directo, Inicio vuelve a abrir la plataforma
        // #606 (owner): INICIO vuelve ARRIBA de la pantalla inicial (los que scrollean son los contenedores internos, no la ventana)
        try { ['basicView', 'easyView', 'entryView', 'homePanel', 'homeFull', 'chatScreen'].forEach((id) => { const el = _el(id); if (el) el.scrollTop = 0; }); window.scrollTo({ top: 0 }); } catch (_) {}
    }
    function setMenuPref(pref, opts) {
        pref = (pref === 'easy' || pref === 'basic' || pref === 'girox') ? pref : 'full'; // #670: + girox
        if (!_menuOn(pref)) pref = _firstMenuOn(); // #635
        // #678 (owner): Girox directo NO queda como predeterminado: abre la plataforma ahora y la próxima vez vuelve a elegir
        // (salvo que toque "Dejar fijo", que sí lo guarda a propósito). Los otros menús se recuerdan como siempre.
        if (pref !== 'girox') { try { localStorage.setItem(MENU_PREF_KEY, pref); } catch (_) {} }
        closeMenuChooser();
        setHomeMode(_modeFor(pref));
        _afterPref(pref); // #670
        setTimeout(installManifestSync, 300); // #673: el manifest lleva el menú elegido
        // #596: sin popup de primera carga // #488
        if (!opts || !opts.quiet) {
            try { VIP.ui.showToast(pref === 'easy' ? '☰ Menú intermedio activado. Lo cambiás cuando quieras con "Cambiar menú".' : (pref === 'basic' ? '▭ Menú básico activado: cargar, retirar y elegir dónde jugás.' : (pref === 'girox' ? '🎰 Girox directo: entrás a jugar al toque; cargás y retirás desde el panel de adentro.' : '🧭 Menú completo activado. Lo cambiás cuando quieras con "Cambiar menú".')), 'success'); } catch (_) {}
        }
    }
    function chooseMenu(pref) { setMenuPref(pref); }
    // #528: el fueguito resumido copia lo que dice la tarjeta grande (la pinta fire.js) — sin duplicar lógica
    function _fireMiniSync() {
        // #578/#627: el básico copia lo que pintan refunds.js / fire.js en el inicio completo: nivel VIP → píldora #vipMiniBtn (al lado de
        // "Cambiar menú"), racha → #bvFireN (en la línea del nombre y el saldo).
        try {
            const lv = _el('vipHeadLvl'), pc = _el('vipHeadPct'), bar = _el('vipBarFill');
            const bl = _el('vipMiniLvl'), bp = _el('vipMiniPct'), bb = _el('vipMiniBar');
            if (lv && bl) bl.textContent = (lv.textContent || '').trim() || 'Nivel';
            if (pc && bp) bp.textContent = (pc.textContent || '').trim();
            if (bar && bb) bb.style.width = bar.style.width || '0%';
            const st = _el('fireHomeStreak'), fn = _el('bvFireN');
            if (st && fn) fn.textContent = (st.textContent || '0').trim();
        } catch (_) {}
        try { const s = _el('fireHomeSub'), st = _el('fireHomeStreak'); const ms = _el('fireMiniSub'), mst = _el('fireMiniStreak'); if (s && ms) ms.textContent = (s.textContent || '').trim() || 'Reclamá tu premio de hoy'; if (st && mst) mst.textContent = (st.textContent || '0').trim() + ' d'; } catch (_) {}
    }
    setInterval(_fireMiniSync, 5000);
    // #512: MENÚ BÁSICO — saludo + saldo, CARGAR, RETIRAR, chips de plataforma (fija la preferida) y "Entrar a jugar".
    // #636: usuario con logo en la franja del saldo del completo
    function _paintBsUser() { try { const u = VIP.state && VIP.state.currentUser && VIP.state.currentUser.username; const b = _el('bsUserName'); if (b) b.textContent = u || '—'; } catch (_) {} }
    function _basicPaint() {
        _paintBsUser();
        try { const u = VIP.state && VIP.state.currentUser && VIP.state.currentUser.username; const h = _el('basicHello'); if (h) h.textContent = u || 'Hola'; } catch (_) {} // #627: sólo el nombre, con el ícono 👤
        try { const b = _el('userBalance'), bb = _el('basicBalance'); if (b && bb && b.textContent) bb.textContent = b.textContent; } catch (_) {}
        const box = _el('basicPlats'); if (!box) return;
        const defId = (_platforms && _platforms.defaultPlatform) || 'girox'; const pref = (_platforms && _platforms.preferredPlatform) || null;
        const soon = (p) => p.connected === false && p.id !== defId && p.id !== 'girox';
        box.innerHTML = _entryList().map((p) => { const on = pref ? pref === p.id : p.id === defId; return '<button type="button" class="bv-chip plat-' + _esc(p.id) + (on ? ' on' : '') + (soon(p) ? ' soon' : '') + '" onclick="VIP.home.basicPick(\'' + _esc(p.id) + '\',' + (soon(p) ? 'true' : 'false') + ')">' + (p.logoUrl ? '<img src="' + _esc(p.logoUrl) + '" alt="">' : '') + '<b>' + _esc(/^jugaygana$/i.test(p.name || '') ? 'Jugaygana' : (p.name || p.id)) + '</b>' + (soon(p) ? '<small>Pronto</small>' : (on ? '<small>✓</small>' : '')) + '</button>'; }).join('');
    }
    async function basicPick(id, isSoon) {
        if (isSoon) { try { VIP.ui.showToast('Pronto: esta plataforma se habilita en breve', 'info'); } catch (_) {} return; }
        try { await setPreferred(id); } catch (_) {}
        _basicPaint();
    }
    // #516: paneles desplegables del básico (uno abierto a la vez); al abrir CARGAR se cargan CBU/alias y mínimos
    let _bvCbu = null;
    // #583 (owner): en el menú BÁSICO, "Carga auto" expande el panel de CARGAR (alias, CBU, pasos) en la MISMA pantalla; en los
    // otros menús va al inicio completo (carga automática), como siempre.
    function autoTap() {
        if (_homeMode === 'basic') {
            const lp = _el('bvLoadPanel');
            if (lp && lp.hidden) basicToggle('load');
            try { setTimeout(() => { const el = _el('bvLoadPanel'); if (el) el.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, 150); } catch (_) {}
            return;
        }
        setHomeMode('full');
    }
    async function basicToggle(which) {
        const lp = _el('bvLoadPanel'), wp = _el('bvWdPanel'); const lb = document.querySelector('#basicView .bv-load'), wb = document.querySelector('#basicView .bv-wd');
        const openLoad = which === 'load' ? lp.hidden : false, openWd = which === 'wd' ? wp.hidden : false;
        if (lp) lp.hidden = !openLoad; if (wp) wp.hidden = !openWd; if (lb) lb.setAttribute('aria-expanded', openLoad ? 'true' : 'false'); if (wb) wb.setAttribute('aria-expanded', openWd ? 'true' : 'false');
        try { const md = _platforms && _platforms.minDepositArs; if (md > 0) { const e = _el('bvMinDep'); if (e) e.textContent = _m$(md); } const mw = _platforms && _platforms.withdrawMinArs; if (mw > 0) { const e2 = _el('bvMinWd'); if (e2) e2.textContent = _m$(mw); } } catch (_) {}
        if (openLoad && !_bvCbu) {
            try { const r = await fetch(VIP.config.API_URL + '/api/config/cbu', { headers: { Authorization: 'Bearer ' + VIP.state.currentToken } }); if (r.ok) _bvCbu = await r.json(); } catch (_) {}
            const c = _bvCbu || {}; const set = (id, v) => { const e = _el(id); if (e) e.textContent = v || 'no disponible'; };
            set('bvAlias', c.alias); set('bvCbu', c.number || c.cbu); set('bvTitular', c.titular); set('bvBank', c.bank);
        }
        if (openLoad) setTimeout(() => { try { lp.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (_) {} }, 50);
    }
    function basicCopy(k) { const c = _bvCbu || {}; const v = k === 'alias' ? c.alias : (c.number || c.cbu); if (!v) return; try { navigator.clipboard.writeText(String(v)); VIP.ui.showToast((k === 'alias' ? 'Alias' : 'CBU') + ' copiado ✓', 'success'); } catch (_) { try { VIP.ui.copyText(String(v)); } catch (__) {} } }
    function basicPlay() { const pref = (_platforms && _platforms.preferredPlatform) || (_platforms && _platforms.defaultPlatform) || 'girox'; openPlatform(pref); }
    // #620 (owner): botón PLATAFORMA de la barra: abre la plataforma elegida para jugar con el saldo (sin cargar). Si hay varias
    // conectadas y todavía no eligió, abre el selector. Con Girox elegida muestra el logo de Girox y su nombre.
    function _platChosen() {
        const list = (_platforms && _platforms.platforms) || [];
        const pid = (_platforms && (_platforms.preferredPlatform || _platforms.lastPlatform)) || null;
        if (pid) return list.find((p) => p.id === pid) || null;
        const conn = list.filter((p) => p.connected !== false);
        if (conn.length === 1) return conn[0];
        const def = (_platforms && _platforms.defaultPlatform) || 'girox';
        return list.find((p) => p.id === def) || null;
    }
    function _paintPlatNav() {
        const b = _el('navPlat'); if (!b) return;
        const p = _platChosen();
        const img = _el('navPlatLogo'), ico = _el('navPlatIco'), lbl = _el('navPlatLbl');
        const logo = p && (p.logoUrl || (p.id === 'girox' ? '/images/soporte-1girox.png' : (p.id === 'ganamos' ? '/images/ganamos.png' : (p.id === 'jugaygana' ? '/images/jugaygana.png' : ''))));
        if (img && logo) { img.src = logo; img.hidden = false; if (ico) ico.hidden = true; } else { if (img) img.hidden = true; if (ico) ico.hidden = false; }
        if (lbl) lbl.textContent = 'JUGÁ AQUÍ'; // #623 (owner): dice JUGÁ AQUÍ; el logo muestra la elegida
        b.title = 'Elegí dónde jugar con tu saldo';
    }
    // #623 (owner): al tocar JUGÁ AQUÍ siempre abre el selector de plataformas (Girox · Ganamos · Jugaygana) para que elija.
    function platTap() { easyPlay(); }
    // #504: ESTRATEGIA — bono de segunda carga vigente + misiones de la semana (progreso real). Se consulta al pintar el Inicio (cache 90 s).
    let _stAt = 0, _stData = null;
    const _m$ = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-AR');
    function _msBar(m) { const pct = Math.min(100, Math.round((m.value / m.target) * 100)); const val = m.type === 'deposit_total' ? _m$(m.value) + ' / ' + _m$(m.target) : m.value + ' / ' + m.target; return '<div class="ms-item' + (m.done ? ' done' : '') + '"><div class="ms-row"><b>' + _esc(m.title) + '</b><span class="ms-prize">' + (m.credited ? '✓ ' + _m$(m.rewardArs) + ' acreditado' : (m.done ? '✓ cumplida' : '+' + _m$(m.rewardArs))) + '</span></div><div class="ms-track"><i style="width:' + pct + '%"></i></div><small>' + val + (m.minAmount ? ' · cargas de ' + _m$(m.minAmount) + ' o más' : '') + '</small></div>'; }
    function _stLeft(exp) { const ms = new Date(exp) - Date.now(); if (ms <= 0) return ''; const h = Math.floor(ms / 3600000), mn = Math.floor((ms % 3600000) / 60000); return h >= 1 ? '· vence en ' + h + ' h' : '· vence en ' + mn + ' min'; }
    function _stPaint() {
        const d = _stData || {}; const sd = d.secondDeposit, ms = d.missions || [];
        _fdNotesPaint(); // #626: aviso de primera carga junto a cada 'Adjuntar comprobante'
        const btn = _el('ezMissions'), card = _el('missionsCard'); const nv = d.nivel || null;
        if (!ms.length) { if (btn) btn.hidden = true; if (card) card.hidden = true; return; }
        const done = ms.filter((m) => m.done).length;
        const nivelTxt = nv ? (nv.emoji + ' ' + nv.name) : '';
        const subeTxt = nv ? (nv.next ? (nv.todasCumplidas ? '¡Completaste todas! La semana que viene jugás en ' + nv.next.emoji + ' ' + nv.next.name + '.' : 'Completá las ' + ms.length + ' y la semana que viene pasás a ' + nv.next.emoji + ' ' + nv.next.name + (nv.vipNextName ? ' (también al llegar a VIP ' + nv.vipNextName + ').' : '.')) : 'Estás en el nivel más alto.') + (nv.vipName ? ' Tu nivel VIP: ' + nv.vipName + '.' : '') : '';
        if (btn) { btn.hidden = false; const bd = _el('ezMissionsBadge'); if (bd) { bd.textContent = done + '/' + ms.length; bd.style.display = ''; } const sub = _el('ezMissionsSub'); if (sub) sub.textContent = (nivelTxt ? 'Nivel ' + nivelTxt + ' · ' : '') + (done === ms.length ? '¡Todas cumplidas!' : done + ' de ' + ms.length + ' cumplidas'); const bars = _el('ezMissionsBars'); if (bars) bars.innerHTML = ms.map((m) => '<i class="' + (m.done ? 'ok' : '') + '" style="--w:' + Math.min(100, Math.round((m.value / m.target) * 100)) + '%"></i>').join(''); }
        try { const ev = _el('evSvcMissions'); if (ev) ev.textContent = done + ' de ' + ms.length + ' cumplidas'; } catch (_) {} // #524
        if (card) { card.hidden = false; const cs = _el('missionsCardSub'); if (cs) cs.textContent = (nivelTxt ? nivelTxt + ' · ' : '') + done + ' de ' + ms.length + ' cumplidas'; const cl = _el('missionsCardList'); if (cl) cl.innerHTML = ms.map(_msBar).join(''); const nt = _el('missionsCardNote'); if (nt) nt.textContent = (d.rolloverX > 0 ? 'El premio se juega x' + d.rolloverX + ' antes de poder retirarlo. ' : '') + (d.maxRewardPct > 0 ? 'Premio hasta el ' + d.maxRewardPct + '% de lo cargado en la semana.' : ''); let op = '0'; try { op = localStorage.getItem('vip_ms_open') || '0'; } catch (_) {} toggleMissionsCard(op === '1'); }
        const list = _el('missionsList'); if (list) list.innerHTML = (nv ? '<div class="ms-level"><b>' + _esc(nivelTxt) + '</b><small>' + _esc(subeTxt) + '</small></div>' : '') + ms.map(_msBar).join('');
        // #518: la sección de misiones del modal Info toma los números reales
        try { const r1 = _el('infoMsRoll'); if (r1 && d.rolloverX != null) r1.textContent = d.rolloverX; const c1 = _el('infoMsCap'); if (c1 && d.maxRewardPct != null) c1.textContent = d.maxRewardPct; const mine = _el('infoMsMine'); if (mine) { if (nv) { mine.style.display = ''; mine.innerHTML = '<b>Vos hoy:</b> nivel ' + _esc(nivelTxt) + ' · ' + done + ' de ' + ms.length + ' cumplidas esta semana' + (nv.next ? ' · si completás todas pasás a ' + _esc(nv.next.emoji + ' ' + nv.next.name) : '') + '. Premios de tu nivel: ' + ms.map((m) => _m$(m.rewardArs)).join(' · ') + '.'; } else mine.style.display = 'none'; } } catch (_) {}
        const msub = _el('missionsSub'); if (msub && d.weekEndsAt) msub.textContent = 'Lunes a domingo · termina el ' + new Date(d.weekEndsAt).toLocaleDateString('es-AR', { weekday: 'long', day: '2-digit', month: '2-digit' }) + ' · el premio se acredita solo' + (d.rolloverX > 0 ? ' y se juega x' + d.rolloverX + ' antes de retirarlo' : '');
    }
    async function loadStrategy(force) {
        const tok = VIP.state && VIP.state.currentToken; if (!tok) return;
        if (!force && Date.now() - _stAt < 90000) { _stPaint(); return; } _stAt = Date.now();
        try { const r = await fetch(VIP.config.API_URL + '/api/strategy/me', { headers: { Authorization: 'Bearer ' + tok } }); if (r.ok) _stData = await r.json(); } catch (_) {}
        _stPaint();
    }
    // #508: en el home completo la tarjeta de misiones arranca PLEGADA (no tapa la carga); se recuerda si la abrió.
    function toggleMissionsCard(force) {
        const body = _el('missionsCardBody'), head = document.querySelector('#missionsCard .ms-card-h'); if (!body) return;
        const open = typeof force === 'boolean' ? force : body.hidden; body.hidden = !open; body.style.display = ''; if (head) head.setAttribute('aria-expanded', open ? 'true' : 'false'); // #629
        try { localStorage.setItem('vip_ms_open', open ? '1' : '0'); } catch (_) {}
    }
    function openMissions() { loadStrategy(true); try { VIP.ui.showModal('missionsModal'); } catch (_) { const m = _el('missionsModal'); if (m) m.classList.remove('hidden'); } }
    // #488: cartel BONO DE PRIMERA CARGA al entrar (quien no cargó nunca), una vez por sesión, después de elegir el menú.
    let _fdShown = false, _fdPromoP = null;
    // #490: la promo de primera carga se consulta una vez por sesión y la usan el cartel y la etiqueta "+X% en tu primera carga" del botón CARGAR AHORA
    function _fdPromoLoad() { if (_fdPromoP) return _fdPromoP; const tok = VIP.state && VIP.state.currentToken; if (!tok) return Promise.resolve(null); _fdPromoP = fetch(VIP.config.API_URL + '/api/first-deposit-promo', { headers: { Authorization: 'Bearer ' + tok } }).then((r) => r.json()).catch(() => null); return _fdPromoP; }
    // #626 (owner): el aviso de PRIMERA CARGA (+pct% · +pctApp% con la app) va RESUMIDO adentro de cada lugar donde se adjunta el
    // comprobante (básico, inicio completo, carga rápida del casino), sólo mientras no hizo la primera carga. Antes era una franja arriba (#608).
    let _fdJ = null;
    function _fdNotesPaint() {
        _fdPromoLoad().then((j) => {
            _fdJ = j || null;
            const show = !!(j && j.show && Number(j.pct) > 0); const extra = show && Number(j.extra) > 0 ? Number(j.extra) : 0;
            try { firstGuidePaint(j); } catch (_) {} // #675
            document.querySelectorAll('.fd-note').forEach((el) => {
                el.hidden = !show; if (!show) return;
                el.querySelectorAll('.fd-pct').forEach((x) => { x.textContent = j.pct + '%'; });
                el.querySelectorAll('.fd-pct-app').forEach((x) => { x.textContent = (Number(j.pct) + extra) + '%'; });
                el.querySelectorAll('.fd-app').forEach((x) => { x.hidden = !extra; });
            });
        }).catch(() => {});
    }
    // #675 (owner): guía de PRIMERA CARGA en el Inicio del completo ("la gente se pierde"): cartel con flecha a CARGÁ AHORA + pulso.
    function firstGuidePaint(j) {
        const g = _el('firstGuide'), gb = _el('firstGuideBasic'), cta = _el('evCtaTop'), bl = _el('bvLoadBtn');
        let off = false; try { off = localStorage.getItem('vip_fguide_off') === '1'; } catch (_) {}
        const show = !!(j && (j.noDeposits === true || j.show)) && !off;
        if (g) g.hidden = !show; if (gb) gb.hidden = !show; // el básico tiene su versión corta (CSS muestra cada una en su modo)
        // #690 (owner): la franja grande de CARGA MÍNIMA se ve hasta la 3ª carga; después desaparece (la nota de adentro de las cargas queda)
        try { const n = j && j.depositsCount != null ? Number(j.depositsCount) : null; if (n != null) { const off = n >= 3; document.body.classList.toggle('ms-off', off); localStorage.setItem('vip_ms_off', off ? '1' : '0'); } } catch (_) {}
        if (cta) cta.classList.toggle('fg-hi', show); if (bl) bl.classList.toggle('fg-hi', show);
    }
    function firstGuideClose() { try { localStorage.setItem('vip_fguide_off', '1'); } catch (_) {} ['firstGuide', 'firstGuideBasic'].forEach((id) => { const g = _el(id); if (g) g.hidden = true; }); ['evCtaTop', 'bvLoadBtn'].forEach((id) => { const b = _el(id); if (b) b.classList.remove('fg-hi'); }); }
    function _fdNoteHtml() {
        const j = _fdJ; if (!(j && j.show && Number(j.pct) > 0)) return '<p class="fd-note" hidden></p>';
        const extra = Number(j.extra) > 0 ? Number(j.extra) : 0;
        return '<p class="fd-note">🎁 <b>Primera carga: +<span class="fd-pct">' + j.pct + '%</span></b>' + (extra ? '<span class="fd-app"> · +<span class="fd-pct-app">' + (Number(j.pct) + extra) + '%</span> si instalás la app</span>' : '') + '<small>Elegís cuál al terminar la carga.</small></p>';
    }
    async function _fdTagPaint() { const tag = _el('ezMainTag'); if (!tag) return; const j = await _fdPromoLoad(); if (j && j.show) { tag.textContent = '🎁 +' + j.pct + '% en tu primera carga' + (j.installGiftEnabled ? ' · +' + j.pctApp + '% con la app' : ''); tag.hidden = false; } else tag.hidden = true; }
    async function maybeFirstDepositPopup() {
        if (_fdShown) return; try { if (sessionStorage.getItem('vip_fd_seen')) return; } catch (_) {}
        const tok = VIP.state && VIP.state.currentToken; if (!tok) return;
        _fdShown = true;
        try {
            const j = await _fdPromoLoad();
            if (!j || !j.show) return;
            const p = _el('fdPct'), pa = _el('fdPctApp'), ap = _el('fdApp'), tx = _el('fdTxt');
            if (p) p.textContent = j.pct + '%'; if (pa) pa.textContent = j.pctApp + '%'; if (ap) ap.style.display = j.installGiftEnabled ? '' : 'none'; if (tx) tx.textContent = j.text || '';
            try { sessionStorage.setItem('vip_fd_seen', '1'); } catch (_) {}
            VIP.ui.showModal('fdModal');
        } catch (_) {}
    }
    function fdClose() { try { VIP.ui.hideModal('fdModal'); } catch (_) { const m = _el('fdModal'); if (m) m.classList.add('hidden'); } }
    function fdGo() { fdClose(); try { easyLoad(); } catch (_) { setHomeMode('full'); } }
    function openMenuChooser() {
        const m = _el('menuChooser'); if (!m) return;
        m.classList.add('open'); document.body.classList.add('mc-open');
    }
    function closeMenuChooser() {
        const m = _el('menuChooser'); if (!m) return;
        m.classList.remove('open'); document.body.classList.remove('mc-open');
    }
    // #367 (owner): se pregunta SIEMPRE al entrar (cada arranque de la app) y de nuevo si la persona se fue y
    // volvió después de 10 minutos en segundo plano. La preferencia guardada sólo define dónde arranca mientras tanto.
    const MENU_REASK_MS = 10 * 60 * 1000;
    let _hiddenAt = 0;
    function maybeShowMenuChooser() {
        const only = MENU_ORDER.filter(_menuOn); if (only.length === 1) { setMenuPref(only[0], { quiet: true }); return; } // #635: un solo menú activo → directo
        const pref = getMenuPref();
        if (pref === 'easy' && _homeMode !== 'easy') setHomeMode('easy', { persist: false });
        if (isMenuFixed() && pref) { setHomeMode(_modeFor(pref)); _afterPref(pref); return; } // #559: preseleccionado → entra directo · #670
        setTimeout(openMenuChooser, 350);
    }
    // #559 (owner): "Dejar preseleccionado para el ingreso" al lado de Cambiar menú. Guarda el menú actual como preferencia
    // y marca que NO se pregunte más al entrar (ni al volver tras 10 min). Tocar de nuevo lo deshace.
    function _prefOfMode() { return _homeMode === 'basic' ? 'basic' : (_homeMode === 'easy' ? 'easy' : (_curPref === 'girox' ? 'girox' : 'full')); } // #670
    function _paintMenuPin() {
        const b = _el('menuPinBtn'), t = _el('menuPinTxt'); if (!b || !t) return;
        const on = isMenuFixed() && getMenuPref() === _prefOfMode();
        b.classList.toggle('on', on);
        const nm = _homeMode === 'basic' ? 'básico' : (_homeMode === 'easy' ? 'intermedio' : (_curPref === 'girox' ? 'Girox directo' : 'completo')); // #670
        t.textContent = on ? ('✓ Menú ' + nm + ' fijo para el ingreso · tocá para deshacer') : ('Dejar fijo el menú ' + nm + ' para el ingreso');
    }
    function toggleMenuPin() {
        const on = isMenuFixed() && getMenuPref() === _prefOfMode();
        try {
            if (on) { localStorage.removeItem(MENU_FIXED_KEY); VIP.ui.showToast('Listo: al entrar te volvemos a preguntar qué menú querés.', 'info'); }
            else { localStorage.setItem(MENU_PREF_KEY, _prefOfMode()); localStorage.setItem(MENU_FIXED_KEY, '1'); VIP.ui.showToast('Listo: este menú queda preseleccionado para cuando entrás.', 'success'); }
        } catch (_) {}
        _paintMenuPin();
        setTimeout(installManifestSync, 300); // #673
    }
    function _menuReaskInit() {
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) { _hiddenAt = Date.now(); return; }
            const away = _hiddenAt ? Date.now() - _hiddenAt : 0;
            _hiddenAt = 0;
            const logged = VIP.state && VIP.state.currentToken && !(_el('chatScreen') || {}).classList?.contains('hidden');
            if (logged && away >= MENU_REASK_MS && !isMenuFixed()) openMenuChooser(); // #559 (#678: con Girox directo también se vuelve a preguntar)
        });
    }
    function easyLoad() { setHomeMode('full'); }
    // #470 (owner): "Ver la plataforma" abre un selector: Girox · Ganamos (Pronto) · Jugaygana (Pronto).
    function easyPlay() {
        const box = _el('easyPlatList'); if (!box) { openPlatform(_entryPlat || 'girox'); return; }
        const defId = (_platforms && _platforms.defaultPlatform) || 'girox';
        const list = _entryList();
        const soon = (p) => p.connected === false && p.id !== defId && p.id !== 'girox';
        const nm = (n) => (/^jugaygana$/i.test(String(n || '')) ? 'Jugaygana' : String(n || ''));
        box.innerHTML = list.map((p) => '<button type="button" class="ep-item ep-' + _esc(p.id) + (soon(p) ? ' soon' : '') + '" onclick="VIP.home.easyPlayPick(\'' + _esc(p.id) + '\',' + (soon(p) ? 'true' : 'false') + ')">' + (p.logoUrl ? '<img src="' + _esc(p.logoUrl) + '" alt="">' : '<i>' + _esc(p.emoji || '🎰') + '</i>') + '<span><b>' + _esc(nm(p.name)) + '</b><small>' + (soon(p) ? 'Pronto' : 'Entrás con tu usuario') + '</small></span><em>' + (soon(p) ? 'Pronto' : '›') + '</em></button>').join('');
        try { VIP.ui.showModal('easyPlatModal'); } catch (_) { const m = _el('easyPlatModal'); if (m) m.classList.remove('hidden'); }
    }
    function easyPlayPick(id, isSoon) {
        if (isSoon) { try { VIP.ui.showToast('Pronto: esta plataforma se habilita en breve', 'info'); } catch (_) {} return; }
        try { VIP.ui.hideModal('easyPlatModal'); } catch (_) { const m = _el('easyPlatModal'); if (m) m.classList.add('hidden'); }
        openPlatform(id || 'girox');
    }
    // Pinta el menú fácil con datos reales: usuario, saldo (espejo de #userBalance), % de reembolso por período
    // (escalera real del server, nada hardcodeado), plata reclamable y % de referidos.
    // #480: opción de menú elegida en el panel (1 = actual, 2 = barra inferior). Se lee una vez por sesión (y al volver al Inicio).
    let _menuLayoutAt = 0, _navPh = null;
    // #481: opción 2 = los botones Carga auto · Inicio · Soporte (con sus separadores) pasan de la barra de arriba a #bottomNav,
    // un <header> con las mismas clases al final de #chatScreen (columna flex: queda abajo de todo, debajo del chat también).
    // Se dejan comentarios-marcador para devolverlos a su lugar exacto si se vuelve a la opción 1.
    function _setMenuLayout(layout) {
        const on = Number(layout) === 2; document.body.classList.toggle('menu2', on);
        try { localStorage.setItem('vip_menu_layout', on ? '2' : '1'); document.documentElement.classList.remove('menu2-pre'); } catch (_) {} // #638: se recuerda para aplicarlo al instante la próxima vez
        const top = document.querySelector('.header.header-toolbar.tb-circles.topnav'); const screen = _el('chatScreen'); if (!top || !screen) return;
        // #558 (owner): abajo van Carga auto · Inicio · PERFIL; Soporte queda arriba, en el lugar que tenía Perfil (antes de Historias).
        const auto = _el('navAuto'), ini = _el('navInicio'), man = _el('navManual'), perf = _el('navPerfil'), hist = _el('navHistorias'), plat = _el('navPlat'); // #620
        let bar = _el('bottomNav');
        if (on) {
            if (bar) return;
            const seps = Array.from(top.querySelectorAll('.tn-sep')).slice(0, 2);
            const menuB = _el('navMenu'); // #644 (owner): abajo van CAMBIAR MENÚ · Inicio · Perfil (Carga auto ya no va abajo: queda oculta con menú 2)
            const nodes = [menuB, seps[0], ini, seps[1], perf].filter(Boolean);
            _navPh = nodes.concat(man ? [man] : []).map((n) => { const ph = document.createComment('nav-ph'); n.parentNode.insertBefore(ph, n); return { n, ph }; });
            bar = document.createElement('header'); bar.id = 'bottomNav'; bar.className = top.className + ' bottom-nav'; bar.setAttribute('aria-label', 'Menú inferior');
            nodes.forEach((n) => bar.appendChild(n)); screen.appendChild(bar);
            if (man && hist && hist.parentNode === top) top.insertBefore(man, hist);
            if (plat && man && man.parentNode === top) top.insertBefore(plat, man); // #621 (owner): PLATAFORMA en el centro de la barra superior
        } else if (bar) {
            (_navPh || []).forEach(({ n, ph }) => { if (ph.parentNode) ph.parentNode.replaceChild(n, ph); }); _navPh = null; bar.remove();
        }
    }
    async function _applyMenuLayout() {
        if (Date.now() - _menuLayoutAt < 120000) return; _menuLayoutAt = Date.now();
        try { const r = await fetch(VIP.config.API_URL + '/api/public/menu-layout'); const j = await r.json(); _setMenuLayout(j && j.layout); if (j && j.menus) _applyMenusEnabled(j.menus); } catch (_) {} // #635
    }
    function _easyPaint() {
        const v = _el('easyView'); if (!v) return;
        _applyMenuLayout();
        try { const u = VIP.state && VIP.state.currentUser && VIP.state.currentUser.username; const h = _el('easyHello'); if (h) h.textContent = u ? ('Hola, ' + u) : 'Hola'; } catch (_) {}
        try { const b = _el('userBalance'), eb = _el('easyBalance'); if (b && eb && b.textContent) eb.textContent = b.textContent; } catch (_) {}
        try {
            const s = VIP.state && VIP.state.refundStatus;
            const mx = (ts) => (ts || []).reduce((m, t) => (t && t.pct > m ? t.pct : m), 0);
            if (s && (s.tiersByPeriod || s.tiers)) {
                const tbp = s.tiersByPeriod || { weekly: s.tiers, monthly: s.tiers };
                const parts = [];
                // #447 (owner): sólo el % del DIARIO; semanal y mensual se nombran sin número.
                if (mx(tbp.daily)) parts.push('Diario ' + mx(tbp.daily) + '%');
                if (mx(tbp.weekly)) parts.push('semanal');
                if (mx(tbp.monthly)) parts.push('mensual');
                const el = _el('easyRefundSub'); if (el && parts.length) el.textContent = parts.join(' · ') + ' de tu NETWIN'; // #458
                let claim = 0;
                ['daily', 'weekly', 'monthly'].forEach((k) => { const d = s[k]; if (d && d.canClaim && Number(d.potentialAmount) > 0) claim += Number(d.potentialAmount); });
                const bd = _el('easyRefundBadge');
                if (bd) { if (claim > 0) { bd.textContent = '¡Tenés $' + Math.round(claim).toLocaleString('es-AR') + ' para cobrar!'; bd.style.display = ''; } else bd.style.display = 'none'; }
            }
        } catch (_) {}
        if (!_easyRefLoaded && VIP.state && VIP.state.currentToken) {
            _easyRefLoaded = true;
            try {
                fetch(VIP.config.API_URL + '/api/referrals/me', { headers: { 'Authorization': 'Bearer ' + VIP.state.currentToken } })
                    .then((r) => (r.ok ? r.json() : null))
                    .then((me) => { if (me && me.referralPct != null) document.querySelectorAll('.ref-pct').forEach((el) => { el.textContent = me.referralPct; }); })
                    .catch(() => {});
            } catch (_) {}
        }
    }
    // ---------------- #268: PERFIL ----------------
    let _pfShown = true; // #393 (owner): la clave se muestra siempre (el botón "Ocultar" sigue)
    let _pfRefCode = null;
    function _pfPaintCode() { // #393: código de referido debajo del nombre
        const box = _el('pfUserCode'), v = _el('pfUserCodeV');
        if (!box || !v) return;
        if (_pfRefCode) { v.textContent = _pfRefCode; box.style.display = ''; return; }
        if (!VIP.state || !VIP.state.currentToken) return;
        fetch(VIP.config.API_URL + '/api/referrals/me', { headers: { 'Authorization': 'Bearer ' + VIP.state.currentToken } })
            .then((r) => (r.ok ? r.json() : null))
            .then((me) => { if (me && me.referralCode) { _pfRefCode = String(me.referralCode); v.textContent = _pfRefCode; box.style.display = ''; } })
            .catch(() => {});
    }
    function _pfPaint() {
        _pfPaintCode();
        const u = (VIP.state && VIP.state.currentUser && VIP.state.currentUser.username) || '—';
        const pw = (VIP.autoload && VIP.autoload.getPassword && VIP.autoload.getPassword()) || '';
        const eu = _el('pfUser'), ep = _el('pfPass'), eye = _el('pfEye'), hint = _el('pfHint');
        if (eu) eu.textContent = u;
        try { const el = _el('pfLink'); if (el) el.textContent = (VIP.autoload && VIP.autoload.appLink && VIP.autoload.appLink()) || (location.origin + '/'); } catch (_) {}
        if (ep) ep.textContent = pw ? (_pfShown ? pw : '•'.repeat(Math.min(12, Math.max(6, pw.length)))) : 'no guardada';
        if (eye) { eye.textContent = _pfShown ? 'Ocultar' : 'Ver'; eye.style.display = pw ? '' : 'none'; }
        if (hint) {
            hint.textContent = !pw ? 'Tu clave no está guardada en este dispositivo. Si la cambiás desde acá, queda guardada.'
                : (pw === 'asd123' ? 'Es la clave inicial: te recomendamos cambiarla desde "Cambiar clave".' : 'Es la misma clave para entrar a la app y a las plataformas.');
        }
    }
    // #645 (owner): Perfil — estado de la verificación de teléfono y de las notificaciones
    function paintPfPhone() {
        try {
            const u = (VIP.state && VIP.state.currentUser) || {}; const ok = u.phoneVerified === true;
            const h = _el('pfPhoneHint'), b = _el('pfPhoneBtn'); if (!h || !b) return;
            h.textContent = ok ? ('Verificado ✓ · ' + (u.phone || '')) : 'Sin verificar · necesaria para retirar';
            b.textContent = ok ? '✓ Verificado' : 'Verificar'; b.classList.toggle('ok', ok);
            const row = _el('pfPhoneRow'), imp = _el('pfPhoneImp'); if (row) row.classList.toggle('pf-important', !ok); if (imp) imp.hidden = ok; // #646 b.title = ok ? 'Tu número ya está verificado. Tocá para cambiarlo.' : 'Verificar mi número';
        } catch (_) {}
    }
    function paintPfNotif() {
        try {
            const h = _el('pfNotifHint'); if (!h) return;
            const perm = ('Notification' in window) ? Notification.permission : 'default';
            h.textContent = perm === 'granted' ? 'Activadas ✓ · si no te llegan, tocá Activar de nuevo' : (perm === 'denied' ? 'Bloqueadas en el teléfono · tocá Activar para ver cómo' : 'Tocá Activar y aceptá el permiso');
        } catch (_) {}
    }
    // #648 (owner): ayudante de la verificación — provincia/ciudad → código de área y cómo completar el número (+54 9 + área sin 0 + número)
    const VP_AREAS = [['Buenos Aires (CABA y GBA)', '11'], ['La Plata', '221'], ['Mar del Plata', '223'], ['Bahía Blanca', '291'], ['Tandil', '249'], ['Junín', '236'], ['Pergamino', '2477'], ['Olavarría', '2284'],
        ['Córdoba capital', '351'], ['Río Cuarto', '358'], ['Villa María', '353'], ['Rosario', '341'], ['Santa Fe capital', '342'], ['Mendoza', '261'], ['San Rafael', '260'], ['Tucumán', '381'], ['Salta', '387'], ['Jujuy', '388'],
        ['Neuquén', '299'], ['Bariloche', '294'], ['Comodoro Rivadavia', '297'], ['Trelew / Rawson', '280'], ['Corrientes', '379'], ['Resistencia (Chaco)', '362'], ['Posadas (Misiones)', '376'], ['Paraná', '343'], ['Concordia', '345'],
        ['San Juan', '264'], ['San Luis', '266'], ['Santiago del Estero', '385'], ['Catamarca', '383'], ['La Rioja', '380'], ['Formosa', '370'], ['Santa Rosa (La Pampa)', '2954'], ['Viedma', '2920'], ['Río Gallegos', '2966'], ['Ushuaia', '2901']];
    function _vpFill() { const sel = _el('vpArea'); if (!sel || sel.options.length > 1) return; VP_AREAS.forEach(([n, c]) => { const o = document.createElement('option'); o.value = c; o.textContent = n + ' · ' + c; sel.appendChild(o); }); }
    function vpHelpToggle(force) { _vpFill(); const b = _el('vpHelpBody'); if (!b) return; b.hidden = typeof force === 'boolean' ? !force : !b.hidden; }
    function vpHelpOpen() { vpHelpToggle(true); }
    function vpAreaPick(code) {
        const h = _el('vpHelpHint'), inp = _el('verifyPhoneInput'); if (!code) { if (h) h.textContent = ''; return; }
        const rest = 10 - code.length; const ej = code === '11' ? '1155551234' : (code.length === 3 ? code + '5551234' : code + '551234');
        if (h) h.innerHTML = 'Tu número: <b>+54 9 ' + code + '</b> + tus <b>' + rest + ' dígitos</b> seguidos, sin espacios (sin el 0 ni el 15). Ej.: <b>' + ej + '</b>';
        if (inp) { inp.value = code; try { inp.focus(); inp.setSelectionRange(code.length, code.length); } catch (_) {} } // #652: de corrido, sin espacio
    }
    function openVerifyPhone() {
        try { const b = _el('vpHelpBody'); if (b) b.hidden = true; const h = _el('vpHelpHint'); if (h) h.textContent = ''; } catch (_) {}
        try { VIP.ui.hideModal('profileModal'); } catch (_) {}
        try {
            const s1 = _el('verifyPhoneStep1'), s2 = _el('verifyPhoneStep2'), inp = _el('verifyPhoneInput'), err = _el('verifyPhoneError');
            if (s1) s1.style.display = ''; if (s2) s2.style.display = 'none'; if (inp) inp.value = ''; if (err) err.classList.remove('show');
        } catch (_) {}
        try { VIP.ui.showModal('verifyPhoneModal'); } catch (_) { const m = _el('verifyPhoneModal'); if (m) m.classList.remove('hidden'); }
    }
    function openProfile() {
        paintPfPhone(); paintPfNotif(); // #645
        _pfShown = true; // #393
        try { if (VIP.autoload && VIP.autoload.hidePreview) VIP.autoload.hidePreview(); } catch (_) {}
        _pfPaint();
        try { _paintAvatar(); } catch (_) {} // #304
        try { VIP.ui.showModal('profileModal'); } catch (_) { const m = _el('profileModal'); if (m) m.classList.remove('hidden'); }
    }
    function profileTogglePw() { _pfShown = !_pfShown; _pfPaint(); }
    function profileCopy(which) {
        const v = which === 'pass' ? ((VIP.autoload && VIP.autoload.getPassword && VIP.autoload.getPassword()) || '')
            : which === 'code' ? (_pfRefCode || '')
            : which === 'link' ? ((VIP.autoload && VIP.autoload.appLink && VIP.autoload.appLink()) || (location.origin + '/'))
            : ((VIP.state && VIP.state.currentUser && VIP.state.currentUser.username) || '');
        if (!v) { try { VIP.ui.showToast('No hay nada para copiar', 'info'); } catch (_) {} return; }
        try { VIP.ui.copyText(v); } catch (_) { try { navigator.clipboard.writeText(v); } catch (__) {} }
    }
    function _initHomeMode() {
        // #307 (owner): al entrar SIEMPRE arranca en Inicio; desde ahí van a Carga auto / manual. (Antes se
        // recordaba el último modo dentro de la sesión: ya no.)
        // #366: salvo que haya elegido el MENÚ FÁCIL (localStorage vip_menu_pref): entonces arranca ahí.
        _paintBsUser(); // #636
        try { if (localStorage.getItem('vip_ms_off') === '1') document.body.classList.add('ms-off'); } catch (_) {} // #690: sin parpadeo
        try { const cl = localStorage.getItem('vip_menu_layout'); if (cl) _setMenuLayout(Number(cl)); } catch (_) {} // #638: menú 1/2 del caché, sin esperar al server
        _applyMenusEnabled(); _applyMenuLayout(); // #635: menús activos (cacheados al instante, refrescados del server)
        const m = _modeFor(getMenuPref()); // #512
        try { sessionStorage.removeItem(HOME_MODE_KEY); } catch (_) {}
        _bindEntryFrame();
        setHomeMode(m, { persist: false });
        _curPref = getMenuPref(); // #670 (si el menú está fijo, maybeShowMenuChooser abre Girox directo)
        try { const c = localStorage.getItem(HOME_BANNER_KEY); if (c) _paintHomeBanner(JSON.parse(c)); } catch (_) {}
        _mirrorHeadBits();
        _watchHeadBits();
        setTimeout(installManifestSync, 1500); // #673
    }
    // Cartel: el texto ya viene renderizado del server ({pct} resuelto). text === null ⇒ vaciado en
    // COMANDOS → sólo el título. El "N%" se resalta en verde.
    // #349: cartel NOVEDAD del Inicio (texto /sys_entry_news; sin texto o sin % diario → se oculta).
    // #376: franja "⏳ Carga pendiente" (carga automática y Menú fácil) mientras un comprobante espera acreditación.
    let _pendTimer = null;
    async function refreshPendingDeposits() {
        if (!VIP.state || !VIP.state.currentToken) return;
        try {
            const r = await fetch(VIP.config.API_URL + '/api/deposits/pending', { headers: { 'Authorization': 'Bearer ' + VIP.state.currentToken } });
            if (!r.ok) return;
            const j = await r.json(); const items = Array.isArray(j.items) ? j.items : [];
            document.querySelectorAll('.dep-pending-strip').forEach((el) => {
                if (!items.length) { el.hidden = true; return; }
                const it = items[0]; const amt = Number(it.amount) > 0 ? '$' + Number(it.amount).toLocaleString('es-AR') : '';
                el.innerHTML = '<span class="dps-ico">⏳</span><span class="dps-t"><b>Carga pendiente' + (amt ? ' · ' + amt : '') + (items.length > 1 ? ' (+' + (items.length - 1) + ')' : '') + '</b><small>' +
                    (it.escalated ? 'Un agente la está verificando · te avisamos en Soporte' : 'En verificación · se acredita sola en minutos') + '</small></span>';
                el.hidden = false;
            });
        } catch (_) {}
        clearInterval(_pendTimer);
        _pendTimer = setInterval(() => { if (!document.hidden) refreshPendingDeposits(); }, 60 * 1000);
    }
    // #373: SOPORTE — presentación de la persona (nombre / texto / plazo), textos de COMANDOS vía /api/platforms.
    function _paintSupportIntro(si) {
        if (!si) return;
        try {
            const nm = (si.name || '').trim(), tx = (si.text || '').trim(), sla = (si.sla || '').trim();
            const n = _el('spName'); if (n && nm) n.textContent = nm;
            const m = _el('spMsg'); if (m && tx) m.textContent = tx;
            const s = _el('spSla'); if (s) { s.textContent = sla ? ('⏱ ' + sla) : ''; s.style.display = sla ? '' : 'none'; }
            const st = _el('waHeadStatus'); if (st) st.textContent = nm ? (nm + ' · en línea' + (sla ? ' · ' + sla.toLowerCase() : '')) : 'en línea';
        } catch (_) {}
    }
    // #384 (owner): los chips MANDAN el mensaje solos. 'cargar' / 'retirar' reciben respuesta automática con botón al sector.
    const SUPPORT_QUICK_TEXT = { carga: '💳 Tengo un problema con una carga', retiro: '💸 Tengo un problema con un retiro', reembolso: '🎁 Tengo un problema con un reembolso', otro: '❓ Tengo un problema con otra cosa', cargar: '💳 Quiero hacer una carga', retirar: '💸 Quiero retirar mi premio' }; // #602 soporte de problemas
    function supportQuick(kind) {
        try {
            const k = SUPPORT_QUICK_TEXT[kind] ? kind : 'otro';
            const i = _el('messageInput'); if (!i) return;
            i.value = SUPPORT_QUICK_TEXT[k];
            if (VIP.chat && VIP.chat.sendMessage) VIP.chat.sendMessage(null, k);
            if (k === 'otro') { setTimeout(() => { try { i.focus(); } catch (_) {} }, 300); }
        } catch (_) {}
    }
    // #603: aviso "Chat cerrado" en el selector cuando Soporte cierra la charla; se borra al abrir un tema nuevo
    function supportClosedNotice() { try { VIP.ui.showToast('🔒 Chat cerrado por Soporte', 'info'); } catch (_) {} } // #613: el aviso fijado lo pinta chat.js con la fecha
    function supportIntroToggle(ev) {
        try { if (ev && ev.target && ev.target.closest && ev.target.closest('button')) return; } catch (_) {}
        const el = _el('supportIntro'); if (!el) return;
        if (document.body.classList.contains('sp-sent')) el.classList.toggle('sp-open');
    }
    // #372: aviso "promoción hasta diciembre" de los reembolsos → todos los .refund-promo (Info, modales, Menú fácil, home).
    function _paintRefundPromo(text) {
        const t = (text == null) ? '' : String(text).trim();
        document.querySelectorAll('.refund-promo').forEach((el) => { el.textContent = t; el.hidden = !t; });
    }
    function _paintEntryNews(en) {
        const el = document.getElementById('evHeroNew');
        if (!el) return;
        if (!en || !en.text) { el.hidden = true; return; }
        const pct = Number(en.pct) || 0;
        const safe = String(en.text).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
        el.innerHTML = pct > 0 ? safe.replace(pct + '%', '<b>' + pct + '%</b>') : safe;
        el.hidden = false;
    }

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
        // #271: recuadro "Fueguito diario" de la carga automática (racha + si hay premio para reclamar).
        try {
            const src = _el('fireStreak'), fh = _el('fireHomeStreak'), card = _el('fireHomeCard'), sub = _el('fireHomeSub');
            const st = VIP.state && VIP.state.fireStatus;
            if (src && fh) fh.textContent = src.textContent || '0';
            if (card) card.classList.toggle('can-claim', !!(st && st.canClaim));
            if (sub && st) sub.textContent = st.canClaim ? '¡Tenés premio para reclamar!' : 'Ya reclamaste hoy · volvé mañana';
            _paintFireLevels(st); // #291
        } catch (_) {}
        // #305: el avatar de la cabecera es el asistente fijo (ya no se espeja el logo de #chatTopbarAvatar).
    }
    // #291: barra con los niveles de fueguito (hitos) + regla de cargas mínimas en el plazo.
    function _paintFireLevels(st) {
        const fill = _el('fireHomeFill'), dots = _el('fireHomeDots'), rule = _el('fireHomeRule');
        // #340: la regla de cargas mínimas se pinta aunque no haya barra (tarjeta simple del home).
        // #405: regla por MONTO (requisito del próximo premio); el mínimo por cantidad sólo si el panel lo tiene > 0.
        const _fmtA = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-AR');
        const _reqA = Number(st && st.nextReqAmount) || 0, _reqD = Number(st && st.nextReqDays) || 0, _reqH = Number(st && st.nextReqHave) || 0, _reqDay = Number(st && st.nextReqDay) || 0;
        if (rule && st) {
            const min = Number(st.minDeposits) || 0;
            const _rN = Number(st.rolloverNeed) || 0, _rH = Number(st.rolloverHave) || 0, _rD = Number(st.rolloverForDay) || 0; // #654
            if (_rN > 0) { rule.innerHTML = '🎯 Premio del día ' + _rD + ': rollover <b>' + _fmtA(_rN) + '</b> (apostado en la plataforma, no cargas) · llevás <b>' + _fmtA(_rH) + '</b> · vuelve a 0 con cada premio'; rule.style.display = ''; }
            else if (min > 0) { rule.innerHTML = '⚠️ Mínimo <b>' + min + ' cargas</b> entre racha y racha · si no, vuelve a 0'; rule.style.display = ''; } // #354: una sola línea
            else if (_reqA > 0) { rule.innerHTML = '⚠️ Premio del día ' + _reqDay + ': cargá <b>' + _fmtA(_reqA) + '</b> en ' + _reqD + ' días · llevás <b>' + _fmtA(_reqH) + '</b> · si no, vuelve a 0'; rule.style.display = ''; }
            else rule.style.display = 'none';
        }
        if (!fill || !dots) return;
        const ms = (st && Array.isArray(st.milestones)) ? st.milestones.filter((m) => m && m.day > 0) : [];
        const streak = Number(st && st.streak) || 0;
        const max = ms.length ? ms[ms.length - 1].day : 30;
        fill.style.width = Math.max(0, Math.min(100, streak / max * 100)) + '%';
        dots.innerHTML = ms.map((m) => {
            const left = Math.max(0, Math.min(100, m.day / max * 100));
            const cls = m.status === 'completed' ? ' on' : (m.status === 'next' ? ' next' : '');
            const prize = m.reward ? ('$' + Math.round(Number(m.reward) / 1000) + 'k') : '';
            return '<span class="fh-dot' + cls + '" style="left:' + left + '%"><i></i><b>' + m.day + 'd</b><small>' + prize + '</small></span>';
        }).join('');
        if (rule) {
            const min = Number(st && st.minDeposits) || 0;
            if (min > 0) {
                const have = st && st.depositsCount != null ? Number(st.depositsCount) : null;
                const days = Number(st && st.depositsWindowDays) || 0;
                rule.textContent = 'Para desbloquear cada premio: mínimo ' + min + ' cargas dentro del plazo' + (days ? ' (' + days + ' días)' : '') + (have != null ? ' · llevás ' + have + '/' + min : '') + '. Si no, la racha se reinicia.';
                rule.style.display = '';
            } else if (_reqA > 0) {
                rule.innerHTML = 'Premio del día ' + _reqDay + ': cargá <b>' + _fmtA(_reqA) + '</b> en los últimos ' + _reqD + ' días · llevás <b>' + _fmtA(_reqH) + '</b>. Si no, la racha se reinicia.';
                rule.style.display = '';
            } else rule.style.display = 'none';
        }
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
        { id: 'ganamos', name: 'Ganamos', playUrl: 'https://www.ganamosvip.me', connected: false, logoUrl: '/images/ganamos-net.png' },
        { id: 'jugaygana', name: 'JUGAYGANA', playUrl: '', connected: false, logoUrl: '/images/jugaygana.png' } // #378
    ];
    let _entryPlat = null, _entryUrl = '', _entryTimer = null, _entryBound = false;
    function _entryList() { const l = (_platforms && _platforms.platforms) || []; return l.length ? l : ENTRY_FALLBACK; }
    // ---------------- #304: AVATAR DEL PERFIL ----------------
    // (owner: "una personita tipo avatar en el nombre, que se pueda abrir y ajustar con diferentes íconos; según el
    //  nivel: nivel 1 avatar común, al avanzar el ícono del nivel que le corresponda"). La clave se guarda en el
    //  server (POST /api/me/avatar) y en localStorage; los íconos de nivel salen de la escalera VIP real.
    const AVATARS_BASE = [['persona', '👤'], ['hombre', '🧔'], ['mujer', '👩'], ['joven', '🧑'], ['incognito', '🕶️'], ['dado', '🎲'], ['carta', '🃏'], ['slot', '🎰'], ['trebol', '🍀'], ['fuego', '🔥'], ['corona', '👑'], ['rayo', '⚡']];
    let _avatar = null;
    function _avatarKey() { return 'vip_avatar_' + String((VIP.state && VIP.state.currentUser && VIP.state.currentUser.username) || '').toLowerCase(); }
    function _curLevelIdx() { const v = VIP.state && VIP.state.vipStatus; return v ? (Number(v.levelIndex) || (v.level && v.level.idx) || 0) : 0; }
    // Un ícono por tier (bronce/plata/oro/platino/diamante/black): se desbloquea al llegar al PRIMER nivel del tier.
    function _vipTiers() {
        const v = VIP.state && VIP.state.vipStatus;
        const levels = (v && Array.isArray(v.levels) && v.levels.length) ? v.levels : (_vipLevelsCache || []);
        const seen = new Map();
        for (const l of levels) { if (!seen.has(l.emoji)) seen.set(l.emoji, { key: 'lvl' + l.idx, emoji: l.emoji, name: String(l.name || '').replace(/\s+[IVX]+$/, ''), idx: l.idx, color: l.color }); }
        return Array.from(seen.values());
    }
    function _avatarOptions() {
        const cur = _curLevelIdx();
        return AVATARS_BASE.map(([key, emoji]) => ({ key, emoji, locked: false }))
            .concat(_vipTiers().map((t) => ({ key: t.key, emoji: t.emoji, name: t.name, locked: cur < t.idx, idx: t.idx, color: t.color })));
    }
    function _avatarEmoji(key) { const o = _avatarOptions().find((x) => x.key === key); return o && !o.locked ? o.emoji : null; }
    function _defaultAvatar() { const v = VIP.state && VIP.state.vipStatus; return (v && v.level && v.level.emoji) || '👤'; }
    // #448: cabecera del Menú fácil — "ver más" con usuario, nivel y código
    function easyToggleMore() {
        const box = _el('ezMore'), btn = _el('ezHelloBtn'); if (!box) return;
        const open = box.hidden; box.hidden = !open;
        if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (!open) return;
        const u = (VIP.state && VIP.state.currentUser && VIP.state.currentUser.username) || '—';
        const eu = _el('ezMoreUser'); if (eu) eu.textContent = u;
        const v = VIP.state && VIP.state.vipStatus; const el = _el('ezMoreLvl'); if (el) el.textContent = v && v.level ? (v.level.emoji + ' ' + v.level.name) : 'Sin nivel todavía';
        const ec = _el('ezMoreCode');
        if (ec) {
            if (_pfRefCode) ec.textContent = _pfRefCode;
            else if (VIP.state && VIP.state.currentToken) {
                ec.textContent = '…';
                fetch(VIP.config.API_URL + '/api/referrals/me', { headers: { 'Authorization': 'Bearer ' + VIP.state.currentToken } }).then((r) => (r.ok ? r.json() : null))
                    .then((me) => { if (me && me.referralCode) { _pfRefCode = String(me.referralCode); ec.textContent = _pfRefCode; } else ec.textContent = '—'; }).catch(() => { ec.textContent = '—'; });
            }
        }
    }
    function _paintAvatar() {
        const em = (_avatar && _avatarEmoji(_avatar)) || _defaultAvatar();
        const a = _el('pfAvatar'); if (a) a.textContent = em;
        const ea = _el('easyAvatar'); if (ea) ea.textContent = em; // #448
        const n = _el('pfUserName'); if (n) n.textContent = (VIP.state && VIP.state.currentUser && VIP.state.currentUser.username) || '—';
        const v = VIP.state && VIP.state.vipStatus;
        const lv = _el('pfUserLvl'); if (lv) { lv.textContent = v && v.level ? ('Nivel ' + v.level.emoji + ' ' + v.level.name) : 'Jugador · sin nivel todavía'; lv.style.color = (v && v.level && v.level.color) || ''; }
        const box = _el('pfUserBox'); if (box) box.style.setProperty('--pf-ring', (v && v.level && v.level.color) || '#00e5ff');
    }
    async function _avatarInit() {
        try { _avatar = localStorage.getItem(_avatarKey()) || null; } catch (_) {}
        _paintAvatar();
        if (!VIP.state || !VIP.state.currentToken) return;
        try {
            const r = await fetch(VIP.config.API_URL + '/api/me/avatar', { headers: { 'Authorization': 'Bearer ' + VIP.state.currentToken } });
            const j = await r.json().catch(() => ({}));
            if (r.ok && j && j.avatar) { _avatar = j.avatar; try { localStorage.setItem(_avatarKey(), _avatar); } catch (_) {} _paintAvatar(); }
        } catch (_) {}
    }
    function openAvatarPicker() {
        const grid = _el('avatarGrid'); if (!grid) return;
        const cur = (_avatar && _avatarEmoji(_avatar)) ? _avatar : null;
        grid.innerHTML = _avatarOptions().map((o) =>
            '<button type="button" class="av-opt' + (o.key === cur ? ' sel' : '') + (o.locked ? ' locked' : '') + '"' +
            (o.locked ? ' title="Se desbloquea en ' + _esc(o.name || 'ese nivel') + '"' : ' onclick="VIP.home.pickAvatar(\'' + _esc(o.key) + '\')"') +
            (o.color ? ' style="--av-c:' + _esc(o.color) + '"' : '') + '>' +
            '<span class="av-e">' + o.emoji + '</span>' + (o.name ? '<small>' + _esc(o.name) + (o.locked ? ' 🔒' : '') + '</small>' : '') + '</button>').join('');
        try { VIP.ui.showModal('avatarModal'); } catch (_) { const m = _el('avatarModal'); if (m) m.classList.remove('hidden'); }
    }
    async function pickAvatar(key) {
        if (!_avatarEmoji(key)) { try { VIP.ui.showToast('🔒 Ese ícono se desbloquea subiendo de nivel', 'info'); } catch (_) {} return; }
        _avatar = key; try { localStorage.setItem(_avatarKey(), key); } catch (_) {}
        _paintAvatar();
        try { VIP.ui.hideModal('avatarModal'); } catch (_) { const m = _el('avatarModal'); if (m) m.classList.add('hidden'); }
        try { await fetch(VIP.config.API_URL + '/api/me/avatar', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (VIP.state && VIP.state.currentToken) }, body: JSON.stringify({ avatar: key }) }); } catch (_) {}
    }
    // #296: los botoncitos "test" sólo los ve el usuario de prueba (owner: "que la página quede original; el test sólo en lalodj").
    const TESTER_USERNAMES = ['lalodj', 'lalodj499910', 'diego576413', 'prueba100', 'diego651917']; // #476 · #506 · #614 · #616
    // #437 (owner): cuentas que ven "Cerrar sesión" al pie de Perfil (body.can-logout). Los testers también lo ven.
    const LOGOUT_USERNAMES = ['lalodj', 'lalodj499910', 'diego294290', 'diego576413', 'prueba100', 'diego651917']; // #505 · #614 · #616
    function _applyTesterClass() {
        const u = String((VIP.state && VIP.state.currentUser && VIP.state.currentUser.username) || '').toLowerCase();
        try { document.body.classList.toggle('can-logout', LOGOUT_USERNAMES.includes(u)); } catch (_) {}
        // #313 (owner): el usuario de prueba ve los tests también con la app INSTALADA (para probar carga, nivel, etc.
        // desde la app). El resto de los usuarios nunca los ve.
        const tester = TESTER_USERNAMES.includes(u);
        if (!tester) _installedTest = false;
        document.body.classList.toggle('is-tester', tester);
    }
    // #299: carga mínima (Config['minDepositArs'], viene en GET /api/platforms). 0 = no se muestra.
    function _paintMinDeposit(n) {
        // #302: si el server (todavía) no manda el valor, queda el default del HTML ($5.000). Sólo 0 explícito lo oculta.
        if (n == null || n === '' || !Number.isFinite(Number(n))) return;
        const v = Math.round(Number(n));
        const txt = v > 0 ? '$' + v.toLocaleString('es-AR') : '';
        const a = _el('loadHereMin'); if (a) a.textContent = txt ? ('carga mínima ' + txt + ' · se acredita solo') : 'se acredita solo';
        const b = _el('alMinDep'); if (b) { b.textContent = txt ? ('· mínimo ' + txt) : ''; b.style.display = txt ? '' : 'none'; }
        const c = _el('alMinLine'); if (c) { const bb = c.querySelector('b'); if (bb) bb.textContent = txt; c.style.display = txt ? '' : 'none'; }
        const d = _el('serviceBannerMin'); if (d) { const bb = d.querySelector('b'); if (bb) bb.textContent = txt; d.style.display = txt ? '' : 'none'; }
        document.querySelectorAll('.md-amt').forEach((x) => { x.textContent = txt || '$5.000'; }); // #684: notas "con $X o más se acredita sola"
        document.querySelectorAll('.min-note').forEach((x) => { x.style.display = txt ? '' : 'none'; });
    }
    // #385: textos de los botones "Adjuntar comprobante aquí" y "Retirar premio" desde COMANDOS (/sys_load_btn*, /sys_withdraw_btn*).
    function _paintActionBtns(ab) {
        if (!ab) return;
        const set = (id, v) => { if (v == null || !String(v).trim()) return; const el = _el(id); if (el) el.textContent = String(v).trim(); };
        try {
            const lb = document.querySelector('#loadHereBtn .lr-text b'); if (lb && ab.load) lb.textContent = String(ab.load).trim();
            set('loadHereMin', ab.loadSub);
            set('withdrawBtnText', ab.withdraw);
            set('withdrawBtnSub', ab.withdrawSub);
        } catch (_) {}
    }
    // #296: con UNA sola plataforma habilitada (Ganamos apagada hasta tener la API) los textos no la nombran.
    function _paintPlatformTexts() {
        const list = (_platforms && _platforms.platforms) || [];
        if (!list.length) return;
        const one = list.length === 1 ? list[0] : null;
        const names = list.map((p) => p.name);
        const why = _el('infoCardWhyTitle');
        if (why) why.textContent = one ? ('¿Por qué elegir ' + one.name + '?') : ('¿Por qué elegir ' + names.join(' o ') + '?');
        const two = _el('infoCardTwoPlats'); if (two) two.style.display = one ? 'none' : '';
        // #407 (owner): título "La plataforma que quieras"; jugaygana en minúscula ACÁ (sólo en Info); lista "A, B y C".
        const _infoName = (n) => (/^jugaygana$/i.test(String(n || '')) ? 'Jugaygana' : String(n || '')); // #431: J mayúscula
        // #439 (owner): sólo los nombres de las plataformas en negrita; el resto del texto normal.
        const _list = names.map((n) => '<b>' + _esc(_infoName(n)) + '</b>'); const _joined = _list.length > 1 ? (_list.slice(0, -1).join(', ') + ' y ' + _list[_list.length - 1]) : (_list[0] || '');
        const twoDesc = _el('infoCardTwoPlatsDesc'); if (twoDesc && !one) twoDesc.innerHTML = _joined + ' con el mismo usuario: elegí en cada carga.'; // #622 texto corto
        const sub = _el('platformsSub');
        if (sub && one) sub.textContent = 'Tus cargas van a ' + one.name + '. Para verla, andá a Inicio.';
        const pt = _el('platformsCardTitleTxt') || document.querySelector('#platformsCard .home-card-title'); if (pt) pt.textContent = one ? 'Tu plataforma' : '¿Dónde querés jugar?';
    }
    function renderEntryTabs() {
        const box = _el('entryTabs'); if (!box) return;
        const list = _entryList();
        // #298/#300: la plataforma default (Girox) SIEMPRE se puede elegir; una sin API se ve con "Próximamente" pero la
        // pestaña sigue abriendo su página como antes (owner: "agregá Ganamos como estaba y ponele próximamente").
        const defId = (_platforms && _platforms.defaultPlatform) || 'girox';
        const isSoon = (p) => p.connected === false && p.id !== defId && p.id !== 'girox'; // #301: Girox NUNCA
        const avail = list.filter((p) => !isSoon(p));
        if (!_entryPlat || !avail.some((p) => p.id === _entryPlat)) {
            const def = (_platforms && _platforms.defaultPlatform) || 'girox';
            _entryPlat = ((avail.find((p) => p.id === def) || avail[0] || list[0]) || {}).id;
        }
        box.innerHTML = list.map((p) => {
            const soon = isSoon(p);
            return '<button type="button" class="ev-tab plat-' + _esc(p.id) + (p.id === _entryPlat ? ' active' : '') + (soon ? ' soon' : '') + '" onclick="VIP.home.entrySwitch(\'' + _esc(p.id) + '\')"' + (soon ? ' title="Próximamente"' : '') + '>' +
            (p.logoUrl ? '<img src="' + _esc(p.logoUrl) + '" alt="">' : '') + '<span class="ev-name">' + _esc(/^jugaygana$/i.test(p.name || '') ? 'Jugaygana' : p.name) + '</span>' + // #523: logo y nombre en línea
            (p.id === 'girox' ? '<span class="ev-reco">Recomendado</span>' : '') +
            (soon ? '<span class="ev-soon">Pronto</span>' : '') + // #511: sutil
            '</button>';
        }).join('');
    }
    function entrySwitch(id) { _entryPlat = id; renderEntryTabs(); _entryLoad(); } // #300: la pestaña siempre abre la página (Ganamos se ve con 'Próximamente')
    // #278: el modo logo de #277 se descartó (owner: "quedó mal") → la web se carga al entrar, como en #267.
    // ---------------- #312: carrusel de fotos ilustrativas de Girox en el Inicio ----------------
    // #327 (owner): fotos nuevas (grillas de juegos: Sugar Rush, Jokers, Fire Joker, Starburst, Crazy Time…); las anteriores se borraron.
    // #331: nombres nuevos (g1..g5) para que ningún caché viejo muestre fotos anteriores. Orden del owner: Jokers, Fire Joker, Starburst, Sugar Rush, Money Time.
    const ENTRY_SLIDES = ['/images/girox-slides/g1.jpg', '/images/girox-slides/g2.jpg', '/images/girox-slides/g3.jpg', '/images/girox-slides/g4.jpg', '/images/girox-slides/g5.jpg', '/images/girox-slides/g6.jpg']; // #473: slots 3×2 (#482: la de lobbies 2×2 se sacó, quedaba mal)
    let _slTimer = null, _slIdx = 0, _slBuilt = false, _slPausedUntil = 0;
    // #332: las fotos se piden con la versión de la app pegada (?b=NNN) → el navegador nunca muestra una foto vieja guardada.
    function _slideUrl(u) { const t = (_el('appBuildTag') || {}).textContent || ''; const m = /v(\d+)/.exec(t); return u + (m ? '?b=' + m[1] : ''); }
    // #489 (owner): el deslizante del Inicio son JUEGOS individuales, grandes, con "N jugando" (número inventado entre 50 y 200,
    // estable por sesión y con pequeños cambios cada 20 s para que se vea vivo). Las tarjetas salen de capturas de la plataforma.
    const ENTRY_GAMES = [['fortune-garuda-1000', 'Fortune Garuda 1000'], ['jokers-jewel', "Joker's Jewel"], ['fortune-garuda-500', 'Fortune Garuda 500'], ['fortune-tiger', 'Fortune Tiger'], ['fortune-gems-2', 'Fortune Gems 2'], ['fortune-rabbit', 'Fortune Rabbit'], ['fortune-gems', 'Fortune Gems'], ['fortune-dragon', 'Fortune Dragon'], ['golden-joker', 'Golden Joker']];
    const _gamePlayers = {}; let _gameTick = null;
    function _gameN(id) { if (!_gamePlayers[id]) _gamePlayers[id] = 50 + Math.floor(Math.random() * 151); return _gamePlayers[id]; }
    // #495 (owner): los "jugando" van variando rato a rato: cada juego cambia solo, en momentos distintos (cada 6–20 s), de a 1 a 9
    // personas, siempre entre 50 y 200, con un parpadeo chiquito del número.
    function _gamesTick() {
        if (document.hidden) return;
        const picks = ENTRY_GAMES.filter(() => Math.random() < 0.45); // en cada pasada cambian algunos, no todos
        picks.forEach(([id]) => {
            const delta = (Math.random() < 0.5 ? -1 : 1) * (1 + Math.floor(Math.random() * 9));
            const n = Math.max(50, Math.min(200, _gameN(id) + delta)); if (n === _gamePlayers[id]) return; _gamePlayers[id] = n;
            const el = document.querySelector('.ev-game[data-g="' + id + '"] b'); if (!el) return;
            el.textContent = n; el.classList.remove('tick'); void el.offsetWidth; el.classList.add('tick');
        });
    }
    function _slidesBuild() {
        const tr = _el('entrySlidesTrack'), dots = _el('entrySlidesDots');
        if (!tr || _slBuilt) return;
        if (ENTRY_GAMES.length) {
            tr.classList.add('games'); const fw = tr.closest('.ev-frame-wrap'); if (fw) fw.classList.add('games');
            if (!_el('evGamesH')) { const hd = document.createElement('div'); hd.id = 'evGamesH'; hd.className = 'ev-games-h'; hd.innerHTML = '<span>🔥 Top juegos</span><small><i></i>gente jugando ahora</small>'; tr.parentNode.insertBefore(hd, tr); }
            tr.innerHTML = ENTRY_GAMES.map(([id, name], i) => '<div class="ev-game" data-g="' + id + '"><img src="' + _slideUrl('/images/games/' + id + '.jpg') + '" alt="' + _esc(name) + '" loading="' + (i < 2 ? 'eager' : 'lazy') + '" decoding="async" draggable="false"><span class="gp"><i></i><b>' + _gameN(id) + '</b> jugando</span></div>').join('');
            if (dots) dots.innerHTML = '';
            const pause = () => { _slPausedUntil = Date.now() + 5000; };
            ['touchstart', 'pointerdown', 'wheel'].forEach((ev) => tr.addEventListener(ev, pause, { passive: true }));
            clearInterval(_gameTick); _gameTick = setInterval(_gamesTick, 7000);
            _slBuilt = true; return;
        }
        // #314: la foto va a TODO el ancho dentro de un recuadro; el fondo es la misma foto desenfocada (nada queda "incompleto").
        // #319: cada foto lleva la etiqueta "FOTO ILUSTRATIVA · acá no se juega" para que nadie intente tocarla.
        tr.innerHTML = ENTRY_SLIDES.map((u0, i) => { const u = _slideUrl(u0); return '<div class="ev-slide" style="background-image:url(' + u + ')"><img src="' + u + '" alt="Foto ilustrativa de Girox ' + (i + 1) + '" loading="' + (i ? 'lazy' : 'eager') + '" decoding="async" draggable="false"></div>'; }).join('');
        if (dots) dots.innerHTML = ''; // #352 (owner): sin puntitos — el botón de cargar va en su lugar; el pase sigue automático
        const pause = () => { _slPausedUntil = Date.now() + 5000; };
        ['touchstart', 'pointerdown', 'wheel'].forEach((ev) => tr.addEventListener(ev, pause, { passive: true }));
        tr.addEventListener('scroll', () => { const w = tr.clientWidth || 1; const i = Math.round(tr.scrollLeft / w); if (i !== _slIdx) { _slIdx = i; _slidesDots(); } }, { passive: true });
        _slBuilt = true;
    }
    function _slidesDots() { const dots = _el('entrySlidesDots'); if (!dots) return; Array.from(dots.children).forEach((d, i) => d.classList.toggle('on', i === _slIdx)); }
    function _slidesGo(i) {
        const tr = _el('entrySlidesTrack'); if (!tr) return;
        if (tr.classList.contains('games')) { // #489: avanza de a una tarjeta y vuelve al principio al llegar al final
            const cards = tr.querySelectorAll('.ev-game'); if (!cards.length) return;
            const step = cards[0].offsetWidth + 10; const max = tr.scrollWidth - tr.clientWidth;
            const next = tr.scrollLeft + step > max + 4 ? 0 : tr.scrollLeft + step; tr.scrollTo({ left: next, behavior: 'smooth' }); return;
        }
        _slIdx = (i + ENTRY_SLIDES.length) % ENTRY_SLIDES.length; tr.scrollTo({ left: _slIdx * tr.clientWidth, behavior: 'smooth' }); _slidesDots();
    }
    function _slidesStart() {
        _slidesBuild();
        const box = _el('entrySlides'); if (box) box.style.display = '';
        clearInterval(_slTimer);
        _slTimer = setInterval(() => {
            if (document.hidden || _homeMode !== 'play' || Date.now() < _slPausedUntil) return;
            _slidesGo(_slIdx + 1);
        }, 3000);
    }
    // #324 (owner): "Link plataforma: www.1girox.com (mirala)" → la web pública de Girox aparte, adentro de la app
    // (ventana /jugar.html con la línea "‹ Volver a cargas"), sin login: es para VERLA antes de jugar.
    function entryViewSite() { openPlatformTab('girox', { test: true }); }
    // #362: Telegram desde la barra de arriba (mismo link que el botón "Soporte Telegram" del login: /api/soporte).
    async function openTelegram() {
        let url = '';
        try { const r = await fetch(VIP.config.API_URL + '/api/config/soporte-vip'); const d = r.ok ? await r.json() : null; url = (d && d.telegram && d.telegram.url) || ''; } catch (_) {}
        if (!url) url = (VIP.state && VIP.state.communityLink) || '';
        if (url) window.open(url, '_blank', 'noopener'); else if (VIP.ui && VIP.ui.showToast) VIP.ui.showToast('Telegram no disponible por ahora', 'info');
    }
    // #323 (owner): expandir el recuadro de fotos a pantalla completa (se ven enteras) y achicar.
    function toggleEntryExpand(force) {
        const w = document.querySelector('.ev-frame-wrap'); const b = _el('entryExpandBtn');
        if (!w) return;
        const on = typeof force === 'boolean' ? force : !w.classList.contains('is-expanded');
        w.classList.toggle('is-expanded', on);
        document.body.classList.toggle('ev-expanded', on);
        if (b) b.textContent = on ? '✕ Achicar' : '⛶ Ver completas';
        try { const tr = _el('entrySlidesTrack'); if (tr) setTimeout(() => tr.scrollTo({ left: _slIdx * tr.clientWidth }), 60); } catch (_) {}
    }
    function _slidesStop() { clearInterval(_slTimer); _slTimer = null; const box = _el('entrySlides'); if (box) box.style.display = 'none'; }
    function entryShowSite() {
        const f = _el('entryFrame'); if (!f) return;
        const p = _entryList().find((x) => x.id === _entryPlat) || {};
        // #312: Girox = carrusel de fotos (no se carga su web); las demás siguen embebidas.
        if ((p.id || _entryPlat) === 'girox') {
            clearTimeout(_entryTimer); _entryStatus(null);
            if (f.getAttribute('src') && f.getAttribute('src') !== 'about:blank') f.src = 'about:blank';
            f.style.display = 'none'; _entryUrl = null;
            _slidesStart();
            return;
        }
        _slidesStop();
        const url = p.playUrl || p.externalUrl || '';
        if (!url) { _entryStatus((p.name || 'Esa plataforma') + (p.connected === false ? ' · Pronto' : ' todavía no está disponible.'), false); return; } // #378: sin web pública aún
        f.style.display = '';
        if (url === _entryUrl && f.getAttribute('src') === url) return;
        _entryUrl = url;
        _entryStatus('🎰 Abriendo ' + (p.name || 'la plataforma') + '…', false);
        f.src = url;
        clearTimeout(_entryTimer);
        _entryTimer = setTimeout(() => { const st = _el('entryStatus'); if (st && !st.hidden) _entryStatus((p.name || 'La plataforma') + ' no terminó de cargar acá adentro.', true); }, 15000);
    }
    function _entryStatus(text, showOpen) {
        const st = _el('entryStatus'); if (!st) return;
        if (text == null) { st.hidden = true; return; }
        st.hidden = false;
        const t = st.querySelector('.ev-st-t'); if (t) t.textContent = text;
        const b = st.querySelector('.ev-st-open'); if (b) b.style.display = showOpen ? '' : 'none';
    }
    function _entryLoad() {
        if (_homeMode !== 'play') return;
        entryShowSite();
    }
    function _entryUnload() {
        clearTimeout(_entryTimer);
        try { toggleEntryExpand(false); } catch (_) {} // #323
        _slidesStop(); // #312
        const f = _el('entryFrame');
        if (f && f.getAttribute('src') && f.getAttribute('src') !== 'about:blank') f.src = 'about:blank'; // libera la página del casino
        if (f) f.style.display = 'none';
        _entryUrl = '';
        _entryStatus(null);
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
        // #305 (owner): la cabecera dice "Carga manual" (antes "Cargas <plataforma>") y el avatar es un asistente fijo.
        try { const n = _el('waHeadName'); if (n) n.textContent = 'Soporte'; } catch (_) {} // #373: era "Carga manual"
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
        // #275: carga acreditada (automática o manual) → cartel "Jugar ahora" si el mensaje es reciente
        // (el historial también pasa por acá: no mostrarlo por cargas viejas).
        if (md && md.kind === 'deposit_credited') {
            try {
                const ts = new Date(message.timestamp || 0).getTime();
                const fresh = !ts || (Date.now() - ts) < 3 * 60000;
                if (fresh && !_playNowShown.has(message.id)) { _playNowShown.add(message.id); _lastDeposit = { platform: md.platform, amount: md.amount, bonus: md.bonus }; showPlayNow(Object.assign({}, _lastDeposit, (_ig && _ig.status === 'offered' && Number(_ig.amount) > 0) ? { gift: _ig } : {})); }
            } catch (_) {}
        }
        // #283: oferta de carga GRATIS por instalar la app (primera carga) → hoja al instante si es reciente.
        if (md && md.kind === 'install_gift_offer') {
            try {
                const ts = new Date(message.timestamp || 0).getTime();
                const fresh = !ts || (Date.now() - ts) < 3 * 60000;
                if (fresh && !_igSeen.has(message.id)) {
                    _igSeen.add(message.id);
                    _ig = Object.assign({}, _ig || {}, { status: 'offered', amount: md.amount, pct: md.pct, baseAmount: md.baseAmount, expiresAt: md.expiresAt || null });
                    _igPaintBar();
                    try { sessionStorage.setItem('vip_ig_shown', '1'); } catch (_) {}
                    showInstallGift({ amount: md.amount, pct: md.pct });
                }
            } catch (_) {}
        }
        if (!_open) { _unread++; _paintBadge(); }
    }

    // ---------------- #275: CARTEL "JUGAR AHORA" ----------------
    // (owner: "cuando detecte la carga que aparezca un cartel que diga jugar ahora y apretándolo se abra
    //  tipo link aparte dentro de la app, entrando a la página original adentro"). Hoja inferior fija;
    // el botón abre la plataforma EMBEBIDA (login automático si tiene API; si no, su web) — siempre adentro.
    const _playNowShown = new Set();
    let _lastDeposit = null; // #294: última carga acreditada en esta sesión (para pegarle la oferta del extra)
    function _platName(pid) {
        const list = (_platforms && _platforms.platforms) || [];
        const p = list.find((x) => x.id === pid);
        return p ? p.name : (pid === 'ganamos' ? 'Ganamos' : (pid === 'jugaygana' ? 'JUGAYGANA' : 'Girox'));
    }
    function showPlayNow(opts) {
        const o = opts || {};
        const pid = o.platform || (_platforms && (_platforms.preferredPlatform || _platforms.lastPlatform || _platforms.defaultPlatform)) || 'girox';
        let card = _el('playNowCard');
        if (!card) return;
        const amt = Number(o.amount) > 0 ? '$' + Math.round(Number(o.amount)).toLocaleString('es-AR') : '';
        const bon = Number(o.bonus) > 0 ? ' + $' + Math.round(Number(o.bonus)).toLocaleString('es-AR') + ' de bono' : '';
        const t = _el('playNowTitle'), s = _el('playNowSub'), b = _el('playNowBtn'), tag = _el('playNowTest');
        if (t) t.textContent = amt ? ('¡Entró tu carga de ' + amt + '!') : '¡Entró tu carga!';
        if (s) s.textContent = 'Ya tenés las fichas en ' + _platName(pid) + bon + '. Entrás con tu sesión, sin salir de la app.';
        if (b) { b.onclick = function () { playNow(pid); }; b.textContent = '🎰 Jugar ahora en ' + _platName(pid); }
        if (tag) tag.style.display = o.test ? '' : 'none';
        // #294: la oferta del % EXTRA por instalar la app va ADENTRO de este cartel (un solo cartel).
        const g = o.gift, gb = _el('pnGift'), later = _el('playNowLater');
        card.dataset.test = o.test ? '1' : '';
        if (gb) {
            if (g && Number(g.amount) > 0) {
                const pct = _igPct(g), inApp = _isStandalone();
                const gt = _el('pnGiftTitle'), ga = _el('pnGiftAmt'), gs = _el('pnGiftSub'), gbtn = _el('pnGiftBtn');
                if (gt) gt.textContent = '🎁 ' + (pct ? '+' + pct + ' EXTRA' : 'EXTRA') + ' por instalar la app';
                if (ga) ga.textContent = '+' + _igFmt(g.amount) + ' extra';
                if (gs) gs.textContent = inApp ? 'Ya estás en la app: tocá y te lo cargamos ahora.' : 'Instalala ahora y te lo cargamos al instante, o seguí jugando y cargalo después: te queda un botón abajo.';
                if (gbtn) { gbtn.disabled = false; gbtn.textContent = inApp ? ('🎁 Cargar mi ' + (pct || 'extra') + (pct ? ' extra' : '') + ' ahora') : ('📲 Instalar ahora y cargar el ' + (pct || 'extra') + (pct ? ' extra' : '')); }
                gb.style.display = ''; card.dataset.gift = '1'; _igSheet = g;
                if (later) later.textContent = inApp ? 'Después' : '🎰 Seguir jugando · lo cargo después';
                if (o.giftOnly) {
                    if (t) t.textContent = '🎁 Tu extra por instalar la app';
                    if (s) s.textContent = 'Te lo cargamos sobre tu última carga apenas instales la app.';
                }
            } else { gb.style.display = 'none'; card.dataset.gift = ''; if (later) later.textContent = 'Después'; }
        }
        if (b) b.style.display = o.giftOnly ? 'none' : '';
        card.classList.add('show');
        card.setAttribute('aria-hidden', 'false');
        // #563 (owner): es una BURBUJA temporal (no tapa el inicio): se va sola a los 15 s. Si traía la oferta del extra por instalar,
        // queda el botón negro grande arriba de "Cambiar menú" ("lo instalo después").
        clearTimeout(_pnTimer);
        _pnTimer = setTimeout(() => { try { if (card.dataset.gift === '1') playNowLater(); else hidePlayNow(); } catch (_) {} }, 15000);
    }
    let _pnTimer = null;
    // #294: "Después" / "Seguir jugando": si el cartel trae la oferta del extra, queda PENDIENTE (barra de abajo).
    function playNowLater() {
        const card = _el('playNowCard');
        if (card && card.dataset.gift === '1') return installGiftLater();
        hidePlayNow();
    }
    function hidePlayNow() { clearTimeout(_pnTimer); const c = _el('playNowCard'); if (c) { c.classList.remove('show'); c.setAttribute('aria-hidden', 'true'); c.dataset.gift = ''; c.dataset.test = ''; } }
    // #296 (owner): "Jugar ahora" abre la plataforma AFUERA de la página (ventana aparte /jugar.html con el login
    // automático ya hecho y una línea finita arriba "‹ Volver a cargas") — así no ven el delay de la app. Vale con y
    // sin la app instalada.
    // #632 (owner): "también cuando la gente carga adjuntando comprobante y le aparece el botón para jugar": con la app instalada
    // "Jugar ahora" abre el casino ADENTRO (y el panel Carga rápida se abre solo, #631); en navegador sigue aparte (#296).
    function playNow(pid) {
        hidePlayNow();
        try { VIP.ui.hideModal('profileModal'); } catch (_) {}
        openPlatform(pid || 'girox'); // #695: siempre adentro (con Carga rápida)
    }
    // Botón chiquito "test" (manual y automática): muestra el cartel como quedaría con una carga de ejemplo.
    function playNowTest() {
        const pid = (_platforms && (_platforms.preferredPlatform || _platforms.lastPlatform || _platforms.defaultPlatform)) || 'girox';
        // #294: el test muestra el cartel COMPLETO: carga de ejemplo + el % extra por instalar la app (50% de $10.000).
        showPlayNow({ platform: pid, amount: 10000, bonus: 0, gift: { amount: 5000, pct: 50, baseAmount: 10000 }, test: true });
    }

    // ---------------- #283/#290: % EXTRA POR INSTALAR LA APP (primera carga) ----------------
    // (owner: "en la primera carga ofrecer una carga gratis si no instaló la app, para retención: 'quiero
    //  jugar y después vengo a instalar' → botón grande abajo PENDIENTE; o instalar en el momento y
    //  reclamar al instante"). El server ofrece (metadata.kind='install_gift_offer') y acredita SOLO desde
    //  la app instalada con notificaciones (token FCM standalone). Estados: offered → deferred → claimed.
    let _ig = null;              // último estado conocido ({status, amount, expiresAt, …})
    const _igSeen = new Set();   // ids de mensajes de oferta ya mostrados
    function _igFmt(n) { return '$' + Math.round(Number(n) || 0).toLocaleString('es-AR'); }
    function _igPct(o) { const p = (o && o.pct != null ? o.pct : (_ig && _ig.pct)); return p != null && p !== '' ? Math.round(Number(p)) + '%' : ''; }
    function _igPctTxt(o, withSpace) { const p = _igPct(o); return p ? (withSpace ? p + ' ' : p) : ''; }
    async function _igFetch(path, method) {
        const r = await fetch(VIP.config.API_URL + path, {
            method: method || 'GET',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (VIP.state && VIP.state.currentToken) },
            body: method === 'POST' ? '{}' : undefined
        });
        const j = await r.json().catch(() => ({}));
        return { ok: r.ok, j };
    }
    async function _igInit() {
        if (!VIP.state || !VIP.state.currentToken) return;
        try {
            const { ok, j } = await _igFetch('/api/install-gift/status');
            if (!ok || !j) return;
            _ig = j;
            _igPaintBar();
            // Oferta sin responder → la hoja se muestra una vez por apertura de la app.
            if (j.status === 'offered' && Number(j.amount) > 0) {
                let shown = false;
                try { shown = !!sessionStorage.getItem('vip_ig_shown'); sessionStorage.setItem('vip_ig_shown', '1'); } catch (_) {}
                if (!shown) showInstallGift(j);
            }
        } catch (_) {}
    }
    function _igPending() { return !!(_ig && (_ig.status === 'deferred' || _ig.status === 'offered') && Number(_ig.amount) > 0); }
    function _igPaintBar() {
        const bar = _el('installGiftBar'); if (!bar) return;
        const pending = _igPending();
        bar.style.display = pending ? '' : 'none';
        document.body.classList.toggle('ig-pending', pending);
        if (!pending) return;
        const amt = _el('igBarAmt'), t = _el('igBarText');
        if (amt) amt.textContent = '+' + _igFmt(_ig.amount);
        const pb = _igPct(_ig);
        if (t) t.textContent = _isStandalone() ? ('Cargá tu ' + (pb || 'extra') + (pb ? ' extra' : '') + ' ahora') : ('Instalá la app y cargá tu ' + (pb || 'extra') + (pb ? ' extra' : ''));
    }
    let _igSheet = null; // oferta que muestra el cartel ahora ({amount, pct})
    // #294: la oferta se muestra ADENTRO del cartel "Jugar ahora" (con la última carga si la hubo en esta sesión).
    function showInstallGift(o) {
        o = o || {};
        showPlayNow(Object.assign({}, _lastDeposit || {}, { gift: o, test: !!o.test, giftOnly: !_lastDeposit }));
    }
    function hideInstallGift() { hidePlayNow(); }
    function _igIsTest() { const c = _el('playNowCard'); return !!(c && c.dataset.test === '1' && c.dataset.gift === '1'); }
    function installGiftOpen() { showInstallGift(_ig || {}); }
    function _igClearTest() { if (_ig && _ig.test) { _ig = null; _igPaintBar(); } }
    // "Ahora quiero jugar": la oferta queda PENDIENTE (botón grande abajo) hasta que instale y reclame.
    async function installGiftLater() {
        const test = _igIsTest();
        const amount = (_ig && Number(_ig.amount) > 0) ? _ig.amount : (_igSheet && _igSheet.amount) || 0;
        hideInstallGift();
        // Primero se pinta el botón grande (local): no depende de que el server conteste.
        _ig = Object.assign({}, _ig || {}, { status: 'deferred', amount, test: !!test });
        _igPaintBar();
        if (test) { try { VIP.ui.showToast('TEST: abajo quedó el botón grande. Tocalo para volver a ver la oferta; al apretar "Instalar/Cargar" se borra el test.', 'info'); } catch (_) {} return; }
        try { const { ok, j } = await _igFetch('/api/install-gift/defer', 'POST'); if (ok && j && j.status && j.status !== 'none') _ig = Object.assign({}, _ig, j); } catch (_) {}
        _igPaintBar();
        try { VIP.ui.showToast('👌 Seguí jugando tranquilo. Cuando quieras, tocá el botón de abajo para cargar tu extra.', 'info'); } catch (_) {}
    }
    // Botón principal: en la app instalada RECLAMA; en el navegador INSTALA (y la oferta queda pendiente).
    async function installGiftMain() {
        if (_igIsTest()) { hideInstallGift(); _igClearTest(); try { VIP.ui.showToast('TEST: acá se instala la app y se carga el extra (fin del test).', 'info'); } catch (_) {} return; }
        if (_isStandalone()) return installGiftClaim();
        hideInstallGift();
        try { await _igFetch('/api/install-gift/defer', 'POST'); } catch (_) {}
        if (_ig && _ig.status === 'offered') _ig.status = 'deferred';
        _igPaintBar();
        try { await VIP.ui.installApp(); } catch (_) {}
        try { VIP.ui.showToast('📲 Cuando termine, abrí la app desde tu pantalla de inicio y tocá el botón de abajo para cargar tu extra.', 'info'); } catch (_) {}
    }
    async function installGiftClaim() {
        if (_ig && _ig.test) { hideInstallGift(); _igClearTest(); return; }
        const btn = _el('pnGiftBtn');
        if (btn) { btn.disabled = true; btn.textContent = 'Cargando tu extra…'; }
        try {
            const { ok, j } = await _igFetch('/api/install-gift/claim', 'POST');
            if (ok && j && j.success) {
                _ig = Object.assign({}, _ig || {}, { status: 'claimed' });
                hideInstallGift(); _igPaintBar();
                try { VIP.ui.showToast(j.message || ('🎁 ¡Listo! Te cargamos ' + _igFmt(j.amount) + ' extra.'), 'success'); } catch (_) {}
                setTimeout(() => { try { VIP.ui.syncBalance(); } catch (_) {} }, 1000);
                showPlayNow({ platform: j.platform, amount: j.amount, bonus: 0 });
                return;
            }
            const code = j && j.code;
            if (code === 'NOT_STANDALONE') {
                if (_isStandalone()) {
                    // Instalada, pero el server todavía no tiene su token de notificaciones → pedir permiso y reintentar.
                    try { VIP.ui.showToast('🔔 Activá las notificaciones para cargarte el extra y volvé a tocar el botón.', 'info'); } catch (_) {}
                    try { VIP.notifications.requestNotificationPermission(); } catch (_) {}
                } else {
                    hideInstallGift();
                    try { VIP.ui.showToast('📲 El extra se carga desde la app instalada.', 'info'); } catch (_) {}
                    try { VIP.ui.installApp(); } catch (_) {}
                }
            } else if (code === 'EXPIRED' || code === 'ALREADY_CLAIMED' || code === 'NOT_OFFERED' || code === 'DEVICE_ALREADY_CLAIMED') {
                _ig = Object.assign({}, _ig || {}, { status: code === 'EXPIRED' ? 'expired' : 'claimed' });
                hideInstallGift(); _igPaintBar();
                try { VIP.ui.showToast((j && j.error) || 'Esta oferta ya no está disponible.', 'info'); } catch (_) {}
            } else {
                try { VIP.ui.showToast((j && j.error) || 'No se pudo acreditar. Probá de nuevo en un rato.', 'error'); } catch (_) {}
            }
        } catch (_) {
            try { VIP.ui.showToast('Sin conexión. Probá de nuevo.', 'error'); } catch (__) {}
        } finally {
            if (btn) { const pct = _igPct(_ig); btn.disabled = false; btn.textContent = _isStandalone() ? ('🎁 Cargar mi ' + (pct || 'extra') + (pct ? ' extra' : '') + ' ahora') : ('📲 Instalar ahora y cargar el ' + (pct || 'extra') + (pct ? ' extra' : '')); }
        }
    }
    // Botón chiquito "test" (carga automática): muestra la oferta como la vería el cliente ($10.000 de ejemplo).
    function installGiftTest() { playNowTest(); } // #294: un solo test (el cartel "Jugar ahora" con el extra adentro)
    // Instaló desde el navegador con la oferta pendiente → recordatorio de cómo reclamar.
    try {
        window.addEventListener('appinstalled', () => {
            if (_igPending()) setTimeout(() => { try { VIP.ui.showToast('✅ App instalada. Abrila desde tu pantalla de inicio y tocá el botón de abajo para cargar tu extra.', 'success'); } catch (_) {} }, 1500);
        });
    } catch (_) {}

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
    // #641 (owner): Info RESUMIDO — cada tarjeta muestra la primera línea; "Ver más ›" la despliega y "Minimizar ▴" la vuelve a plegar.
    function infoMore(btn) {
        const p = btn && btn.previousElementSibling; if (!p) return;
        const open = p.classList.toggle('open'); btn.textContent = open ? 'Minimizar ▴' : 'Ver más ›';
    }
    function infoFoldInit() {
        try {
            document.querySelectorAll('#infoMsg .im-sec').forEach((p) => {
                p.classList.remove('open'); const btn = p.nextElementSibling;
                if (!btn || !btn.classList.contains('im-more')) return;
                btn.textContent = 'Ver más ›';
                btn.style.display = (p.style.display === 'none' || p.hidden) ? 'none' : (p.scrollHeight > p.clientHeight + 4 ? '' : 'none');
            });
        } catch (_) {}
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
        try { _paintInstallStrip(); } catch (_) {}
    }
    // #291 (owner): con la app instalada, al lado del saldo va el NIVEL VIP con su progreso en vez de
    // "Instalar app". El botoncito "test" simula la app instalada para verlo desde el navegador.
    let _installedTest = false;
    function _installedView() { return _installedTest || _isStandalone(); }
    function _paintInstallStrip() {
        const ib = _el('homeInstallAppBtn'), vs = _el('homeVipStrip');
        if (!ib || !vs) return;
        const on = _installedView();
        ib.style.display = on ? 'none' : '';
        vs.style.display = on ? '' : 'none';
        if (!on) return;
        const v = VIP.state && VIP.state.vipStatus;
        const lvl = _el('hvLevel'), sub = _el('hvSub'), fill = _el('hvFill'), pc = _el('hvPct');
        if (!v || v.enabled === false || !Array.isArray(v.levels) || !v.levels.length) {
            if (_installedTest) { // #294: en el test se ve como si fuera real (ejemplo), y se puede abrir la escalera
                if (lvl) { lvl.textContent = '🥈 Plata I'; lvl.style.color = '#c0c0c0'; }
                if (sub) sub.textContent = '40% hacia Plata II';
                if (fill) { fill.style.width = '40%'; fill.style.background = 'linear-gradient(90deg, #c0c0c0, #ffd700)'; }
                if (pc) pc.textContent = '40%';
                return;
            }
            if (lvl) { lvl.textContent = 'Nivel VIP'; lvl.style.color = ''; }
            if (sub) sub.textContent = 'cargando…';
            if (fill) fill.style.width = '0%';
            if (pc) pc.textContent = '';
            return;
        }
        const pct = Math.round(Math.max(0, Math.min(100, Number(v.progressPct) || 0)));
        if (lvl) { lvl.textContent = v.level ? (v.level.emoji + ' ' + v.level.name) : 'Sin nivel aún'; lvl.style.color = (v.level && v.level.color) || ''; }
        if (sub) sub.textContent = v.next ? (pct + '% hacia ' + v.next.name) : 'nivel máximo';
        if (fill) { fill.style.width = (v.next ? pct : 100) + '%'; fill.style.background = 'linear-gradient(90deg, ' + ((v.level && v.level.color) || '#00e5ff') + ', ' + ((v.next && v.next.color) || '#7c4dff') + ')'; }
        if (pc) pc.textContent = (v.next ? pct : 100) + '%';
    }
    function installedTestToggle() {
        _installedTest = !_installedTest;
        _paintInstallStrip();
        try { VIP.ui.showToast(_installedTest ? 'TEST: así se ve con la app instalada (nivel VIP al lado del saldo)' : 'TEST: vista normal (Instalar app)', 'info'); } catch (_) {}
    }
    // #294 (owner): tocar el nivel abre la ESCALERA completa (modal), también en el test (datos de ejemplo si
    // el server todavía no mandó el estado VIP). Niveles: VIP.state.vipStatus.levels o GET /api/vip/levels.
    let _vipLevelsCache = null;
    async function openVipLevels() {
        const v = VIP.state && VIP.state.vipStatus;
        let levels = (v && Array.isArray(v.levels) && v.levels.length) ? v.levels : _vipLevelsCache;
        if (!levels) {
            try { const r = await fetch(VIP.config.API_URL + '/api/vip/levels'); const j = await r.json(); levels = _vipLevelsCache = (j && j.levels) || []; } catch (_) { levels = []; }
        }
        const sample = !v && _installedTest;
        const curIdx = v ? (Number(v.levelIndex) || (v.level && v.level.idx) || 0) : (sample ? 3 : 0);
        const nextIdx = curIdx + 1;
        const pct = v ? Math.round(Math.max(0, Math.min(100, Number(v.progressPct) || 0))) : (sample ? 40 : 0);
        const cur = levels.find((l) => l.idx === curIdx), nx = levels.find((l) => l.idx === nextIdx);
        const mine = _el('vipLevelsMine'), list = _el('vipLevelsList');
        if (mine) mine.innerHTML = (cur ? 'Tu nivel: <b style="color:' + _esc(cur.color || '#fff') + '">' + _esc(cur.emoji + ' ' + cur.name) + '</b>' : 'Todavía sin nivel') + (nx ? ' · <b>' + pct + '%</b> hacia ' + _esc(nx.emoji + ' ' + nx.name) : ' · nivel máximo') + (sample ? ' <small>(ejemplo del test)</small>' : '');
        // #663 (owner): tarjetas como las de Reembolsos; abre PLEGADO mostrando sólo el nivel actual ("Nivel actual") — o el
        // próximo si todavía no tiene — y "Ver más ›" despliega la escalera completa.
        const _money = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-AR');
        const keepIdx = cur ? curIdx : (nx ? nextIdx : null);
        if (list) list.innerHTML = levels.length ? levels.map((l) => {
            const isCur = !!cur && l.idx === curIdx, reached = !!cur && l.idx <= curIdx, isNext = l.idx === nextIdx, keep = l.idx === keepIdx;
            const badge = isCur ? '<span class="vl-badge cur">Nivel actual</span>' : reached ? '<span class="vl-badge ok">✓ Alcanzado</span>' : isNext ? '<span class="vl-badge nx">' + (cur ? 'Próximo' : 'Próximo nivel') + '</span>' : '';
            const black = /black/i.test(String(l.key || l.name));
            return '<div class="ur-card vl-card' + (isCur ? ' cur' : '') + (reached ? ' on' : '') + (isNext ? ' next' : '') + (keep ? ' keep' : '') + '">' +
                '<div class="ur-head"><i class="li vl-li" style="background:' + _esc(l.color || '#e60023') + '">' + _esc(l.emoji || '👑') + '</i><div><b>' + _esc(l.name) + ' ' + badge + '</b>' +
                '<small>Apostado acumulado <em>' + (Number(l.thresholdArs) > 0 ? _money(l.thresholdArs) : '—') + '</em></small></div></div>' +
                '<div class="ur-state">' + (Number(l.levelUpBonusArs) > 0 ? '🎁 Bono al subir <b>' + _money(l.levelUpBonusArs) + '</b> · ' : '') + '<b>' + Number(l.rakebackPct).toLocaleString('es-AR') + '%</b> rakeback semanal' + (black ? ' · 🖤 soporte personalizado por Telegram' : '') + '</div></div>';
        }).join('') : '<p class="vl-empty">No pudimos cargar los niveles. Probá de nuevo.</p>';
        if (list) { list.classList.add('vl-less'); const b = _el('vlLessBtn'); if (b) b.textContent = 'Ver más ›'; }
        try { VIP.ui.showModal('vipLevelsModal'); } catch (_) { const m = _el('vipLevelsModal'); if (m) m.classList.remove('hidden'); }
    }
    function vipStripOpen() { openVipLevels(); }
    // #659 (owner): "Ver menos" en los niveles VIP — deja sólo los alcanzados y el próximo; "Ver todos" vuelve a la lista completa.
    function vipLevelsLess(btn) { const l = _el('vipLevelsList'); if (!l) return; const less = l.classList.toggle('vl-less'); if (btn) btn.textContent = less ? 'Ver más ›' : 'Ver menos'; } // #663: plegado = sólo el nivel actual
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
            body.innerHTML = '<p class="vip-body-p">Cuanto más jugás, más subís. Cada nivel que alcanzás te <b>desbloquea plata</b> (el 🎁 de cada fila, se reclama acá) y un <b>rakeback semanal</b> (% de lo que apostás, ganes o pierdas).</p>' +
                v.levels.map(l => {
                    const reached = l.idx <= curIdx;
                    const isNext = v.next && l.idx === v.next.idx;
                    return '<div class="vip-lvl vip-lvl-3' + (reached ? ' on' : '') + (isNext ? ' next' : '') + '">' +
                        '<span class="vip-lvl-st">' + (reached ? '✓' : '🔒') + '</span>' +
                        '<span class="vip-lvl-name" style="color:' + _esc(l.color || '#fff') + '">' + _esc(l.emoji + ' ' + l.name) + (isNext ? ' <small>próximo</small>' : '') + '</span>' +
                        // #292 (owner): mostrar la plata que DESBLOQUEA cada nivel (bono al llegar) + rakeback; sin el apostado que falta.
                        '<span class="vip-lvl-win">' + (Number(l.levelUpBonusArs) > 0 ? '🎁 $' + Math.round(Number(l.levelUpBonusArs)).toLocaleString('es-AR') + ' · ' : '') + Number(l.rakebackPct).toLocaleString('es-AR') + '% rakeback</span>' +
                        '</div>';
                }).join('');
        }
        try { _paintInstallStrip(); } catch (_) {} // #291: nivel al lado del saldo (app instalada)
        try { _paintAvatar(); } catch (_) {} // #304: avatar/nivel en el perfil
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
            try { _paintPlatNav(); } catch (_) {} // #620
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
        const soon = p.connected === false && p.id !== 'girox' && p.id !== ((_platforms && _platforms.defaultPlatform) || 'girox'); // #298/#300/#301: sin API → "Próximamente" (Girox y la default NUNCA)
        const onSelect = soon ? "VIP.ui.showToast('🔜 " + _esc(p.name) + ": próximamente', 'info')" : "VIP.home.choosePlatform('" + _esc(p.id) + "')";
        const logo = p.logoUrl ? '<img class="plat-logo" src="' + _esc(p.logoUrl) + '" alt="">' : '';
        return '<div class="plat-play-wrap' + (isPref ? ' is-pref' : '') + (soon ? ' soon' : '') + '">' +
            '<button type="button" class="plat-play-btn plat-' + _esc(p.id) + (isPref ? ' is-pref' : '') + (soon ? ' soon' : '') + '" onclick="' + onSelect + '">' +
            '<span class="plat-check">' + (isPref ? '✓' : '') + '</span>' +
            logo +
            '<span class="plat-play-name">' + label + '</span>' +
            // #255 (owner): Girox lleva un "Recomendado" chiquito en rojo; #286: DEBAJO del nombre (antes flotaba arriba).
            (p.id === 'girox' ? '<span class="plat-reco">Recomendado</span>' : '') +
            (soon ? '<span class="plat-soon-badge">Pronto</span>' : '') + // #353 (owner): se entiende sin tocar · #511: sutil
            // #271: sin "Entrar" acá (verlas = Inicio). Tocar la fija la suelta (vuelve el cartel al cargar).
            '<span class="plat-play-sub">' + (soon ? 'Pronto' : (isPref ? 'Fija · tus cargas van acá' : 'Tocá para dejarla fija')) + '</span>' +
            '</button></div>';
    }
    function choosePlatform(platformId) {
        const cur = (_platforms && _platforms.preferredPlatform) || null;
        if (cur === platformId) { setPreferred(null); return; } // #271: ya fija → soltarla (se pregunta en cada carga)
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
        // #695 (owner): "en Entrar a la página no figura el chat de carga rápida" → el casino con sesión se abre SIEMPRE ADENTRO
        // (overlay con Carga rápida, Retirar e Ir a Soporte), también en navegador. La pestaña aparte (/jugar.html) queda sólo
        // para el modo prueba (sitio público, sin sesión) fuera de la app instalada. Antes (#261) en navegador iba aparte.
        if (test && !_isStandalone()) return openPlatformTab(platformId, { test });
        const list = (_platforms && _platforms.platforms) || [];
        const p = list.find(x => x.id === platformId) || { id: platformId, name: platformId, connected: platformId === 'girox' };
        if (test) _embedExternal({ id: p.id, name: p.name, playUrl: p.playUrl || p.externalUrl, externalUrl: p.externalUrl });
        else if (p.connected) { try { VIP.ui.enterCasino(p.id); } catch (_) {} }
        else _embedExternal(p);
        _setCasinoTestMode(test);
        // #631 (owner): al entrar a jugar (JUGÁ AQUÍ, Entrar a jugar, pestañas) el panel de Carga rápida (datos + adjuntar) se abre solo
        // apenas carga el casino; la ✕ lo cierra. En modo prueba no.
        setTimeout(() => { _setCasinoTestMode(test); _setupCasinoQuick(); if (!test) { _quickDismissed = false; try { toggleCasinoLoad(true); } catch (_) {} } }, 60);
    }
    function playOn(platformId) { openPlatform(platformId); }
    // #673 (owner): INSTALAR EN iPHONE CON LA SESIÓN. iOS no comparte el localStorage de Safari con la app instalada: el manifest
    // (que iOS captura al instalar) lleva un token de acceso de un solo uso del propio cliente + el menú elegido, y la app instalada
    // arranca logueada (auth.js tryAccessLink) con el mismo menú; Girox abre con SSO. Token cacheado 7 días por usuario.
    function _isIOS() { try { return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream; } catch (_) { return false; } }
    async function installManifestSync() {
        try {
            if (!_isIOS() || _isStandalone()) return;
            const u = VIP.state && VIP.state.currentUser && VIP.state.currentUser.username, tk = VIP.state && VIP.state.currentToken;
            if (!u || !tk) return;
            let c = null; try { c = JSON.parse(localStorage.getItem('vip_install_tok') || 'null'); } catch (_) {}
            if (!c || c.u !== u || !c.t || Date.now() - (c.at || 0) > 7 * 86400000) {
                const r = await fetch(VIP.config.API_URL + '/api/auth/install-link', { method: 'POST', headers: { 'Authorization': 'Bearer ' + tk } });
                const j = await r.json(); if (!r.ok || !j.token) return;
                c = { u, t: j.token, at: Date.now() }; try { localStorage.setItem('vip_install_tok', JSON.stringify(c)); } catch (_) {}
            }
            const pref = getMenuPref(), fixed = isMenuFixed();
            const href = '/manifest.json?a=' + encodeURIComponent(c.t) + (pref ? '&menu=' + pref + (fixed ? '&fixed=1' : '') : '');
            const l = document.querySelector('link[rel="manifest"]'); if (l && l.getAttribute('href') !== href) l.setAttribute('href', href);
        } catch (_) {}
    }
    // #670: Retirar desde la Carga rápida del casino. El modal de retiro vive en la página; CSS lo pone por encima del casino.
    // #687: salir del casino y abrir el chat de Soporte (modo mini)
    function casinoSupport() { try { VIP.ui.closeCasinoFrame(); } catch (_) {} setTimeout(() => { try { setHomeMode('mini'); } catch (_) {} }, 80); }
    function casinoWithdraw() { try { if (VIP.withdraw && VIP.withdraw.openWithdrawModal) VIP.withdraw.openWithdrawModal(); else VIP.ui.showToast('Retiros no disponibles ahora', 'error'); } catch (_) {} }

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
        // #598 (owner): panel CHICO y simple: los datos para copiar (alias · CBU · titular) y UN botón para adjuntar el comprobante.
        const row = (k, v) => v ? '<div class="cl-row"><small>' + k + '</small><b>' + _esc(v) + '</b><button type="button" class="cl-copy" onclick="VIP.ui.copyText(\'' + _esc(v) + '\')">Copiar</button></div>' : '';
        p.innerHTML =
            '<div class="cl-head"><span>💳 Carga rápida</span><button type="button" class="cl-close" onclick="VIP.home.toggleCasinoLoad(false)">✕</button></div>' +
            (cbu ? row('Alias', cbu.alias) + row('CBU', cbu.number) + row('Titular', cbu.titular) : '<div class="cl-meta">cargando datos…</div>') +
            // (#631: si los datos todavía no llegaron, se vuelve a pintar en 1,5 s)
            _fdNoteHtml() + // #626
            // #684 (owner): carga mínima clara también acá
            (function () { const md = Number(_platforms && _platforms.minDepositArs) || 5000; return '<p class="cl-meta min-note">✅ Con <b>$' + md.toLocaleString('es-AR') + '</b> o más se acredita sola. <b>Con una carga menor a $' + md.toLocaleString('es-AR') + ', tu carga NO va a ser acreditada</b>: <button type="button" class="sup-link" onclick="VIP.home.casinoSupport()">💬 escribinos a Soporte ›</button></p>'; })() +
            '<button type="button" class="cl-btn" onclick="VIP.autoload.sendReceipt()">📎 Adjuntar comprobante</button>' +
            // #670 (owner): Retirar desde adentro del casino (mismo flujo que el botón de afuera: datos + SMS + pago automático)
            '<button type="button" class="cl-btn cl-wd" onclick="VIP.home.casinoWithdraw()">💸 Retirar premio</button>' +
            // #687 (owner): botón para ir DIRECTO a Soporte desde adentro del casino
            '<button type="button" class="cl-btn cl-sup" onclick="VIP.home.casinoSupport()">💬 Ir a Soporte</button>';
        p.style.display = '';
        _fdNotesPaint();
        if (!cbu) setTimeout(() => { if (_quickOpen) toggleCasinoLoad(true); }, 1500); // #631
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
    // #633 (owner 2026-10-20): ADENTRO del casino NO se cambia de plataforma ("si elige Girox, que aparezca Girox; para cambiar, saliendo").
    // La barra de arriba queda con "‹ Volver" y el nombre de la plataforma en la que está; las pestañas (#222) se eliminaron.
    function renderCasinoTabs() {
        const overlay = _el('casinoOverlay');
        if (!overlay) return;
        let bar = _el('casinoTopBar');
        if (!bar) {
            overlay.insertAdjacentHTML('afterbegin',
                '<div id="casinoTopBar" class="casino-topbar">' +
                  '<div class="casino-topbar-row">' +
                    '<button type="button" class="casino-back" onclick="VIP.ui.closeCasinoFrame()">‹ Volver</button>' +
                    // #700/#701 (owner): accesos en UNA sola línea con el mismo formato de la barra principal (ícono + etiqueta chica):
                    // Historias · Menú · Info · Perfil. Sin el texto "Estás en Girox · para cambiar, salí" (#701: le sacaba lugar al juego).
                    '<span class="casino-topbar-sp"></span>' +
                    '<button type="button" class="tn-btn tn-stories" id="ctStories" onclick="VIP.stories.open()" title="Historias"><span class="tn-ico st-ring"><span class="st-core">▶</span><span class="st-badge" id="ctStoriesBadge" style="display:none">1</span></span><span class="tn-lbl">Historias</span></button>' +
                    '<button type="button" class="tn-btn" onclick="VIP.home.casinoFullMenu()" title="Ver el menú completo de la app"><span class="tn-ico"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg></span><span class="tn-lbl">Menú</span></button>' +
                    '<button type="button" class="tn-btn" onclick="VIP.home.casinoInfo()" title="Información del servicio"><span class="tn-ico"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9.2"/><path d="M12 11v5.5M12 7.6v.2"/></svg></span><span class="tn-lbl">Info</span></button>' +
                    '<button type="button" class="tn-btn" onclick="VIP.home.openProfile()" title="Tu perfil"><span class="tn-ico"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20.5c.8-4 3.9-6 7.5-6s6.7 2 7.5 6"/></svg></span><span class="tn-lbl">Perfil</span></button>' +
                  '</div>' +
                '</div>');
            bar = _el('casinoTopBar');
        }
        // #700: el contador de historias nuevas copia el de la barra principal; sin historias cargadas el botón igual abre el visor.
        try { const src = _el('storiesBadge'), dst = _el('ctStoriesBadge'); if (src && dst) { dst.textContent = src.textContent; dst.style.display = src.style.display; } const nh = _el('navHistorias'), cs = _el('ctStories'); if (nh && cs) cs.classList.toggle('has-active', nh.classList.contains('has-active') || nh.classList.contains('has-new')); } catch (_) {}
        document.body.classList.add('casino-open'); // #700: los modales (Info, Perfil, historias…) van por encima del casino
        // (#701: ya no se pinta el título "Estás en <plataforma> · para cambiar, salí")
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
        // #700: al cerrar el casino se saca la clase que sube los modales
        const _origCloseFrame = VIP.ui && VIP.ui.closeCasinoFrame;
        if (typeof _origCloseFrame === 'function') {
            VIP.ui.closeCasinoFrame = function () {
                try { document.body.classList.remove('casino-open'); } catch (_) {}
                return _origCloseFrame.apply(this, arguments);
            };
        }
    } catch (_) {}
    // #700 (owner): accesos desde la barra del casino. "Menú completo" cierra el casino y pasa al menú completo (sin quedar fijo
    // si la persona entró por Girox directo: #678 sigue valiendo, se guarda 'full' como cualquier otra elección del selector).
    function casinoFullMenu() { try { VIP.ui.closeCasinoFrame(); } catch (_) {} setTimeout(() => { try { setMenuPref('full', { quiet: true }); } catch (_) {} }, 80); }
    // Info del servicio: mismo handler que el botón de la cabecera (app.js lo cuelga en #infoBtn).
    function casinoInfo() { try { const b = _el('infoBtn'); if (b) { b.click(); return; } } catch (_) {} try { VIP.ui.showModal('infoModal'); } catch (_) {} }

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
                // #269/#359: tarjeta "Reembolso" del Inicio — % máximo real entre DIARIO (#349), semanal y mensual.
                const top = Math.max(mx(tbp.daily), mx(tbp.weekly), mx(tbp.monthly));
                const sv = _el('evSvcRefund'); if (sv) sv.textContent = mx(tbp.daily) ? ('Diario ' + mx(tbp.daily) + '%') : ('hasta ' + top + '%'); // #447/#458 · #524 (owner): sólo "Diario 25%"
                const d = _el('infoDailyMax'); if (d && mx(tbp.daily)) d.textContent = mx(tbp.daily);
            }
        } catch (_) {}
        try { _easyPaint(); } catch (_) {} // #366: menú fácil con los % reales
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
        try { _paintMinDeposit(_platforms && _platforms.minDeposit); } catch (_) {} // #299
        try { _paintActionBtns(_platforms && _platforms.actionBtns); } catch (_) {} // #385
        try { _paintEntryNews(_platforms && _platforms.entryNews); } catch (_) {} // #349
        try { _paintRefundPromo(_platforms && _platforms.refundPromo); } catch (_) {} // #372
        try { _paintSupportIntro(_platforms && _platforms.supportIntro); } catch (_) {} // #373
        try { refreshPendingDeposits(); } catch (_) {} // #376
        _paintWaHeadName();
        try { _igInit(); } catch (_) {} // #283: oferta / botón pendiente de la carga gratis por instalar la app
        try { renderEntryTabs(); _entryLoad(); } catch (_) {} // #267: lista real de plataformas en la entrada
        try { if (VIP.reviews && VIP.reviews.renderEntrySlider) VIP.reviews.renderEntrySlider(); } catch (_) {} // #270: reseñas al pie del Inicio
        renderHowItWorks();
        try { _applyTesterClass(); } catch (_) {} // #296: botones de test sólo para el usuario de prueba
        try { _avatarInit(); } catch (_) {} // #304
        try { _menuReaskInit(); } catch (_) {} // #367: volver a preguntar fácil / completo tras 10 min afuera
        try { _paintPlatformTexts(); } catch (_) {} // #296: textos según cuántas plataformas hay
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

    VIP.home = { casinoFullMenu, casinoInfo, casinoSupport, firstGuideClose, installManifestSync, casinoWithdraw, vipLevelsLess, vpHelpToggle, vpHelpOpen, vpAreaPick, paintPfPhone, paintPfNotif, openVerifyPhone, infoMore, infoFoldInit, platTap, supportClosedNotice, autoTap, toggleMenuPin, openTelegram, goHome, supportQuick, supportIntroToggle, refreshPendingDeposits, getMenuPref, setMenuPref, chooseMenu, openMenuChooser, closeMenuChooser, maybeShowMenuChooser, easyLoad, easyPlay, easyPlayPick, easyToggleMore, maybeFirstDepositPopup, fdGo, fdClose, loadStrategy, openMissions, toggleMissionsCard, basicPick, basicPlay, basicToggle, basicCopy, init, openSupport, closeSupport, toggleSupport, isSupportOpen, loadPlatforms, getHomeMode, setHomeMode, toggleHomeMode, syncWaHead: _mirrorHeadBits, renderEntryTabs, entrySwitch, entryOpen, openProfile, profileTogglePw, profileCopy, svcRefund, svcRoulette, showPlayNow, hidePlayNow, playNow, playNowTest, playNowLater, toggleEntryExpand, entryViewSite, installedTestToggle, vipStripOpen, openVipLevels, openAvatarPicker, pickAvatar, applyTesterClass: _applyTesterClass, showInstallGift, hideInstallGift, installGiftOpen, installGiftMain, installGiftLater, installGiftClaim, installGiftTest, entryShowSite, renderPlatforms, playOn, renderHowItWorks, toggleHow,
        renderCasinoTabs, switchPlatform, openChangePassword, setPreferred, toggleBubble, dismissBubble, restoreBubble, choosePlatform, paintInstallButtons, openPlatformTab, openPlatform, toggleCasinoLoad, dismissCasinoQuick, restoreCasinoQuick, toggleAccess, openInApp, renderSupportTests, toggleInfoReviews, toggleInfoVip, toggleInfoRoulette, renderVipDetail, toggleRefHow, toggleVipCard, renderVipCard, renderVipClaim, pickVipClaimPlat, claimLevelBonus, loadReferralClaimable, claimReferral,
        get platformsData() { return _platforms; } };
})();
