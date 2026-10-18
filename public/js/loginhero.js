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
        // #416: historias publicadas (tira de círculos) + opinión de la gente: promedio real y una reseña corta que rota.
        try { if (VIP.stories && VIP.stories.loadPublic) VIP.stories.loadPublic('lgStories'); } catch (_) {}
        try {
            const r = await fetch(VIP.config.API_URL + '/api/reviews/public?limit=12&random=1');
            if (r.ok) {
                const d = await r.json(); const t = _el('lgTrust');
                if (t && d && d.total > 0) {
                    const avg = Number(d.avgStars || 0); const full = Math.round(avg);
                    t.innerHTML = '<span class="lg-stars">' + '★'.repeat(full) + '<i>' + '★'.repeat(5 - full) + '</i></span><b>' + avg.toFixed(1).replace('.', ',') + '</b><span>· ' + Number(d.total).toLocaleString('es-AR') + ' opiniones de jugadores</span>';
                    t.style.display = '';
                }
                const q = _el('lgQuote');
                const quotes = ((d && d.items) || []).filter((it) => { const c = String(it.comment || '').trim(); return c && !/^[1-5] estrellas$/i.test(c); }).slice(0, 8);
                if (q && quotes.length) {
                    let i = 0;
                    const paint = () => { const it = quotes[i % quotes.length]; q.innerHTML = '<span class="lg-quote-t">“' + _esc(String(it.comment).trim().slice(0, 110)) + '”</span><span class="lg-quote-n">' + _esc(it.maskedUsername || '***') + ' · ' + '★'.repeat(Math.max(1, Math.min(5, Math.round(Number(it.stars) || 5)))) + '</span>'; q.style.display = ''; };
                    paint();
                    if (quotes.length > 1) setInterval(() => { q.style.opacity = '0'; setTimeout(() => { i++; paint(); q.style.opacity = '1'; }, 250); }, 5200);
                }
            }
        } catch (_) {}
        let info = null;
        try { const r = await fetch(VIP.config.API_URL + '/api/landing/info'); if (r.ok) info = await r.json(); } catch (_) {}
        if (!info) return;
        try {
            const rf = info.refunds || {};
            const parts = [];
            if (rf.dailyMax) parts.push('Diario ' + rf.dailyMax + '%');
            if (rf.weeklyMax) parts.push('Semanal ' + rf.weeklyMax + '%');
            if (rf.monthlyMax) parts.push('Mensual ' + rf.monthlyMax + '%');
            const chip = _el('lgChipRefund');
            if (chip) chip.textContent = rf.dailyMax ? ('💸 Reembolso diario ' + rf.dailyMax + '%') : (rf.maxPct ? '💸 Reembolsos hasta ' + rf.maxPct + '%' : '💸 Reembolsos');
            const txt = _el('lgRefunds'); if (txt && parts.length) txt.textContent = parts.join(' · ') + ' de lo que perdés con tu plata. Se cobra solo desde la app.';
            const promo = _el('lgRefundPromo'); if (promo) { promo.textContent = info.refundPromo || ''; promo.hidden = !info.refundPromo; }
        } catch (_) {}
        try {
            const min = Number(info.minDepositArs);
            if (min > 0) { const c = _el('lgChipMin'); if (c) c.textContent = '💵 Carga mínima ' + _money(min); const m = _el('lgMin'); if (m) m.textContent = _money(min); }
            const wm = Number(info.withdrawMinArs);
            if (wm > 0) { const w = _el('lgWithdrawMin'); if (w) w.textContent = 'Retiros desde ' + _money(wm) + ' con pago automático a tu CBU.'; }
        } catch (_) {}
        try {
            const box = _el('lgPlats');
            const list = Array.isArray(info.platforms) ? info.platforms : [];
            if (box && list.length) {
                box.innerHTML = list.map((p) => '<span class="lg-plat' + (p.connected ? '' : ' soon') + '">' + (p.logoUrl ? '<img src="' + _esc(p.logoUrl) + '" alt="">' : '') + '<b>' + _esc(p.name) + '</b>' + (p.connected ? '' : '<small>Próximamente</small>') + '</span>').join('');
            }
        } catch (_) {}
    }
    VIP.loginHero = { init };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(init, 50));
    else setTimeout(init, 50);
})();
