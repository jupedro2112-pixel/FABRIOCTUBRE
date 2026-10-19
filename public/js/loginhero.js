// #381 (owner 2026-10-18): PANTALLA DE INGRESO "tope de gama", con el estilo de la app. Datos reales y públicos de
// GET /api/landing/info (plataformas, reembolsos por período, carga mínima, retiro mínimo, aviso promocional) y las
// reseñas públicas (reviews.js). Nada hardcodeado: si el server no responde quedan los textos genéricos del HTML.
(function () {
    'use strict';
    window.VIP = window.VIP || {};
    function _el(id) { return document.getElementById(id); }
    function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
    function _money(n) { return '$' + Math.round(Number(n) || 0).toLocaleString('es-AR'); }
    let _done = false;
    async function init() {
        if (_done) return; _done = true;
        // #417: historias → anillo arriba a la derecha; reseñas → slider que se desliza solo (como adentro) + promedio real.
        try { if (VIP.stories && VIP.stories.loadPublic) VIP.stories.loadPublic('lgStoriesRing'); } catch (_) {}
        try { if (VIP.reviews && VIP.reviews.renderEntrySlider) VIP.reviews.renderEntrySlider('loginReviews', { noAdd: true }); } catch (_) {}
        try {
            const r = await fetch(VIP.config.API_URL + '/api/reviews/public?limit=1');
            if (r.ok) {
                const d = await r.json(); const t = _el('lgTrust');
                if (t && d && d.total > 0) {
                    const avg = Number(d.avgStars || 0); const full = Math.round(avg);
                    t.innerHTML = '<span class="lg-stars">' + '★'.repeat(full) + '<i>' + '★'.repeat(5 - full) + '</i></span><b>' + avg.toFixed(1).replace('.', ',') + '</b><span>· ' + Number(d.total).toLocaleString('es-AR') + ' opiniones de jugadores</span>';
                    t.style.display = '';
                }
            }
        } catch (_) {}
        let info = null;
        try { const r = await fetch(VIP.config.API_URL + '/api/landing/info'); if (r.ok) info = await r.json(); } catch (_) {}
        if (!info) { VIP.loginHero.ready = true; return; }
        // #421/#422: entrada rápida (sólo nombre) si el panel está en 'quick' O si la persona llegó por un LINK DE PUBLICIDAD
        // (atribución de campaña); el inicio normal sigue con Iniciar sesión / Crear mi cuenta.
        try {
            let viaAd = false;
            try { const inj = window.__VIP_CAMPAIGN_CODE__; if (inj && typeof inj === 'string' && inj.indexOf('__VIP_CAMPAIGN') === -1) viaAd = true; } catch (_) {}
            try { if (!viaAd && VIP.campaign && VIP.campaign.getActive) { const a = VIP.campaign.getActive(); viaAd = !!(a && a.code); } } catch (_) {}
            document.body.classList.toggle('reg-quick', info.registrationMode === 'quick' || viaAd);
            // #538: tilde del panel "Pantalla de ingreso = Iniciar sesión": usuario + clave + olvidé mi contraseña, sin bono.
            // Un link de publicidad o de referido SIEMPRE muestra el registro (si no, el cliente nuevo no sabría qué hacer).
            const viaRef = !!(window._vipRefLocked && new URLSearchParams(location.search).get('ref'));
            document.body.classList.toggle('entry-login', !!info.entryLogin && !viaAd && !viaRef);
            // #541: SMS obligatorio para registrarse desde el inicio (no por link de publicidad)
            VIP.loginHero.quickSms = !!info.quickEntrySms && !viaAd;
            if (document.body.classList.contains('reg-quick') && !(VIP.state && VIP.state.currentToken)) showRegister(); // #542
        } catch (_) {}
        VIP.loginHero.ready = true; // #533: app.js espera esto para decidir dónde cae el link de referido
        // #533: si hay un código de referido guardado (link de hoy o de los últimos 30 días), se avisa en el registro rápido.
        try { const h = _el('quickRefHint'); if (h && window._vipRefLocked && document.body.classList.contains('reg-quick')) { h.style.display = ''; h.querySelector('b').textContent = window._vipRefLocked; } } catch (_) {}
        try {
            const rf = info.refunds || {};
            const parts = [];
            if (rf.dailyMax) parts.push('Diario ' + rf.dailyMax + '%');
            if (rf.weeklyMax) parts.push('Semanal ' + rf.weeklyMax + '%');
            if (rf.monthlyMax) parts.push('Mensual ' + rf.monthlyMax + '%');
            const chip = _el('lgChipRefund');
            if (chip) chip.textContent = rf.dailyMax ? ('💸 Reembolso diario ' + rf.dailyMax + '%') : (rf.maxPct ? '💸 Reembolsos hasta ' + rf.maxPct + '%' : '💸 Reembolsos');
            const txt = _el('lgRefunds'); if (txt && parts.length) txt.textContent = parts.join(' · ') + ' de tu NETWIN. Se cobra solo desde la app.'; // #458
            const promo = _el('lgRefundPromo'); if (promo) { promo.textContent = info.refundPromo || ''; promo.hidden = !info.refundPromo; }
        } catch (_) {}
        // #530: banner del bono con los % reales (primera carga; con la app instalada el total)
        try {
            // #537 (owner): grande el % CON la app, "EN TU PRIMERA CARGA", y en chico "instalando la app · si no, X%".
            const w = info.welcome || {}; const big = _el('lgBonusBig'), sub = _el('lgBonusSub'), note = _el('lgBonusNote');
            const pApp = Number(w.withApp) || 0, pNo = Number(w.pct) || 0; const top = pApp > 0 ? pApp : pNo;
            if (big && top > 0) big.textContent = top + '%';
            if (sub) sub.textContent = 'EN TU PRIMERA CARGA';
            if (note) { const t = pApp > pNo ? (pNo > 0 ? ('instalando la app · si no, ' + pNo + '%') : 'instalando la app') : ''; note.textContent = t; note.style.display = t ? '' : 'none'; }
            const rf = info.refunds || {}; const sr = _el('lgSyRefund'); if (sr && rf.dailyMax) sr.textContent = rf.dailyMax + '%';
            const rp = Number(info.referralPct); const er2 = _el('lgSyRef'); if (er2 && rp > 0) er2.textContent = rp + '%';
        } catch (_) {}
        try {
            const min = Number(info.minDepositArs);
            if (min > 0) { const c = _el('lgChipMin'); if (c) c.textContent = '💵 Carga mínima ' + _money(min); const m = _el('lgMin'); if (m) m.textContent = _money(min); }
            const wm = Number(info.withdrawMinArs);
            if (wm > 0) { const w = _el('lgWithdrawMin'); if (w) w.textContent = 'Retiros desde ' + _money(wm) + ' con pago automático a tu CBU.'; }
        } catch (_) {}
        // #423: fila visible de plataformas (Girox · Ganamos · jugaygana) con "Próximamente" para las que no tienen API.
        try {
            const row = _el('lgPlatsRow');
            const list2 = Array.isArray(info.platforms) ? info.platforms : [];
            if (row && list2.length) {
                // Igual que las pestañas de adentro (#301): Girox NUNCA es "Próximamente" (aunque en el entorno de prueba no haya API).
                const isSoon = (p) => p.connected === false && p.id !== 'girox';
                const _nm = (n) => (/^jugaygana$/i.test(String(n || '')) ? 'Jugaygana' : String(n || '')); // #428/#431: 'Jugaygana' con J mayúscula
                row.innerHTML = list2.map((p) => '<span class="lg-plat-pill' + (isSoon(p) ? ' soon' : '') + '">' + (p.logoUrl ? '<img src="' + _esc(p.logoUrl) + '" alt="">' : '<i>' + _esc(p.emoji || '🎰') + '</i>') + '<b>' + _esc(_nm(p.name)) + '</b>' + (isSoon(p) ? '<small>Pronto</small>' : '') + '</span>').join(''); // #435: 'Pronto'
                row.style.display = '';
            }
        } catch (_) {}
        // #424: textos de las tarjetas de beneficios con los % reales
        try {
            const rf = info.refunds || {}; const el = _el('lgFeatRefunds');
            // #447 (owner): sólo el % del diario; semanal y mensual sin número.
            const parts = []; if (rf.dailyMax) parts.push('Diario ' + rf.dailyMax + '%'); if (rf.weeklyMax) parts.push('semanal'); if (rf.monthlyMax) parts.push('mensual');
            if (el && parts.length) el.textContent = parts.join(' · ') + ' de tu NETWIN'; // #458
            const rp = Number(info.referralPct); const er = _el('lgFeatRef');
            if (er && rp > 0) er.textContent = 'Invitá amigos y cobrás el ' + rp + '% de su actividad, de por vida';
        } catch (_) {}
        try {
            const box = _el('lgPlats');
            const list = Array.isArray(info.platforms) ? info.platforms : [];
            if (box && list.length) {
                box.innerHTML = list.map((p) => '<span class="lg-plat' + (p.connected ? '' : ' soon') + '">' + (p.logoUrl ? '<img src="' + _esc(p.logoUrl) + '" alt="">' : '') + '<b>' + _esc(p.name) + '</b>' + (p.connected ? '' : '<small>Pronto</small>') + '</span>').join('');
            }
        } catch (_) {}
    }
    // #530: popup de enganche (idea de la landing del owner): a los 12 s, una vez por sesión, sólo en registro rápido y si no escribió nada.
    setTimeout(() => {
        try {
            if (sessionStorage.getItem('vip_lgpop')) return;
            const ls = _el('loginScreen'); const nm = _el('quickName');
            if (!ls || ls.classList.contains('hidden') || !document.body.classList.contains('reg-quick')) return;
            if (VIP.state && (VIP.state.currentToken || VIP.state.currentUser)) return;
            if (nm && nm.value.trim()) return;
            const done = _el('quickDone'); if (done && done.style.display !== 'none') return;
            sessionStorage.setItem('vip_lgpop', '1');
            const pop = _el('lgPop'); if (pop) pop.classList.add('on');
        } catch (_) {}
    }, 12000);
    // #538: "Crear mi cuenta" desde el modo Iniciar sesión → vuelve al registro (nombre, o formulario SMS según el tilde)
    // #541 (owner): "Registrarse" = sólo el nombre (+ celular verificado por SMS) y entra; vale en cualquier modo de registro.
    // #542: el registro vive en una pantalla interna (#regScreen). Con SMS obligatorio: nombre → CONTINUAR → celular + código.
    function showRegister() {
        document.body.classList.remove('entry-login');
        document.body.classList.add('reg-quick');
        const rs = _el('regScreen'); if (rs) rs.hidden = false;
        try {
            const sms = !!VIP.loginHero.quickSms;
            const sb = _el('quickSmsBox'); if (sb) sb.hidden = true; // recién después de CONTINUAR
            const nb = _el('quickNextBtn'); if (nb) nb.hidden = !sms;
            const eb = _el('quickEntryBtn'); if (eb) eb.hidden = sms;
        } catch (_) {}
        try { window.scrollTo(0, 0); const q = _el('quickName'); if (q) q.focus(); } catch (_) {}
    }
    function closeRegister(toLogin) {
        const rs = _el('regScreen'); if (rs) rs.hidden = true;
        if (toLogin) document.body.classList.remove('reg-quick');
        try { const u = _el('username'); if (toLogin && u) u.focus(); } catch (_) {}
    }
    VIP.loginHero = { init, showRegister, closeRegister, ready: false, quickSms: false };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(init, 50));
    else setTimeout(init, 50);
})();
