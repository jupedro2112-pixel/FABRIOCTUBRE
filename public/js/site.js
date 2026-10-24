// ============================================================================
// #944 (owner 2026-10-24): SITIO JUGAYGANA INDEPENDIENTE — "cuando entren a JUGAYGANA que no aparezca nada más que JUGAYGANA; es
// independiente de Girox pero usamos todos sus juegos y deportes".
//
// Se activa entrando por /jugaygana (⇒ /?jg=1) y queda guardado en el teléfono (localStorage vip_site), así una recarga sigue siendo
// JUGAYGANA. /?pr=1 o /?gn=1 lo apagan. El script del <head> de index.html arma el modo (window.VIP_SITE, clase html.site-jyg, título,
// íconos y la pantalla de carga negra con el logo) ANTES de pintar nada; este archivo hace el resto:
//  - todo texto visible con "PICA ROJA" / "Girox" pasa a decir JUGAYGANA (también lo que llega después: chat, avisos, modales);
//  - el ícono de PICA ROJA (/icons/icon-*.png) se cambia por el de JUGAYGANA;
//  - saca la pantalla de carga cuando abre la página de JUGAYGANA (lobby.js) o cuando hay que mostrar el login.
// La página no se cierra (lobby.close) y los juegos que no abren directo NO caen en la web de Girox (home.js favPlay): ver WORKLOG #944.
// ============================================================================
(function () {
    'use strict';
    if (window.VIP_SITE !== 'jugaygana') return;
    const H = document.documentElement;
    const ICON = '/images/jugaygana/app-192.png';
    const REPL = [
        [/PICA[\s-]?ROJA/g, 'JUGAYGANA'], [/Pica[\s-]?Roja/g, 'JugaYGana'], [/pica[\s-]?roja/g, 'jugaygana'],
        [/1\s?GIROX/g, 'JUGAYGANA'], [/1\s?Girox/gi, 'JugaYGana'], [/GIROX/g, 'JUGAYGANA'], [/Girox/g, 'JugaYGana']
    ];
    const RX = /pica[\s-]?roja|girox/i;
    const SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, INPUT: 1, NOSCRIPT: 1 };
    const fix = (t) => { let o = t; for (const [a, b] of REPL) o = o.replace(a, b); return o; };
    function fixText(n) { if (n.nodeValue && RX.test(n.nodeValue)) { const v = fix(n.nodeValue); if (v !== n.nodeValue) n.nodeValue = v; } }
    function fixEl(el) {
        if (el.tagName === 'IMG') { const s = el.getAttribute('src') || ''; if (/\/icons\/icon-\d/.test(s)) el.setAttribute('src', ICON); }
        for (const a of ['title', 'aria-label', 'alt', 'placeholder']) { const v = el.getAttribute && el.getAttribute(a); if (v && RX.test(v)) el.setAttribute(a, fix(v)); }
    }
    function scan(root) {
        if (!root) return;
        if (root.nodeType === 3) { fixText(root); return; }
        if (root.nodeType !== 1 || SKIP[root.tagName] || root.id === 'brandLock') return; // F980: el cartel "entrá desde PICA ROJA" no se traduce
        fixEl(root);
        const w = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
            acceptNode: (n) => (n.nodeType === 1 && (SKIP[n.tagName] || n.id === 'brandLock') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT)
        });
        let n; while ((n = w.nextNode())) { if (n.nodeType === 3) fixText(n); else fixEl(n); }
    }
    function ready() { H.classList.add('jyg-ready'); }
    function start() {
        scan(document.body);
        new MutationObserver((muts) => {
            for (const m of muts) {
                if (m.type === 'characterData') fixText(m.target);
                else if (m.type === 'attributes') fixEl(m.target);
                else for (const x of m.addedNodes) scan(x);
            }
        }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['src', 'title', 'aria-label', 'alt', 'placeholder'] });
        // El login se muestra ⇒ fuera la pantalla de carga (lobby.js la saca al abrir la página).
        try {
            const orig = VIP.ui && VIP.ui.showLoginScreen;
            if (typeof orig === 'function') VIP.ui.showLoginScreen = function () { ready(); return orig.apply(this, arguments); };
        } catch (_) {}
        setTimeout(ready, 12000); // nunca queda trabada
        // Con sesión, JUGAYGANA está siempre abierta: si algo la cerró (salir del chat de Soporte, un botón de la app), se vuelve a abrir.
        // Sólo se deja el chat de Soporte (modo 'mini') y el casino/juego abiertos encima.
        setInterval(() => {
            try {
                if (!(VIP.state && VIP.state.currentToken) || document.body.classList.contains('prl-open') || (VIP.ui && VIP.ui._casinoOpen)) return;
                if (VIP.home && VIP.home.getHomeMode && VIP.home.getHomeMode() === 'mini') return;
                VIP.lobby.open('inicio', 'jugaygana');
            } catch (_) {}
        }, 900);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
