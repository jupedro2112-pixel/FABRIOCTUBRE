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
    // #923 seguridad: texto que va DENTRO de un onclick='…' (nombres de proveedores que vienen de 1girox): se sacan comillas, barras y < > & ANTES
    // de escapar (si no, &#39; vuelve a ser comilla al ejecutarse y un nombre armado podría inyectar código).
    const jsq = (x) => esc(String(x == null ? '' : x).replace(/[\\'"`<>&\r\n]/g, ''));
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
        up: '<path d="M6 5h12M12 20V9M7 13l5-5 5 5"/>',
        wallet: '<path d="M4 7h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a1 1 0 0 1-1-1V7z"/><path d="M4 7l11-3v3"/><path d="M15 13.5h2.5"/>'
    };
    const ico = (k) => '<svg class="prl-ic" viewBox="0 0 24 24" aria-hidden="true">' + (IC[k] || '') + '</svg>';
    // #912: la misma página con otro estilo por marca (todas son puertas a la MISMA cuenta de Girox).
    const SKINS = {
        picaroja: { name: 'PICA ROJA', sub: 'Página exclusiva', logo: '/images/picaroja/logo-mono.svg', home: '/images/picaroja/logo-mono.svg', bar: '/icons/icon-192x192.png', cls: '', dir: '/images/picaroja/' },
        // #916 (owner: marca propia, jugaygana.io): diseño, banners y orden de colecciones de su inicio, con los juegos y la cuenta de Girox.
        jugaygana: { name: 'JUGAYGANA', sub: '', logo: '/images/jugaygana/io/logo.webp', home: '/images/jugaygana/icon.svg', bar: '/images/jugaygana/icon.svg', cls: 'prl-jyg prl-jio', dir: '/images/jugaygana/', wordmark: true, layout: 'jugaygana' },
        // #914 (owner: marca propia, ganandoargentina.com): diseño y orden de su página, con los juegos y la cuenta de Girox.
        ganamos: { name: 'Ganamos', sub: '', logo: '/images/ganamos/logo.webp', home: '/images/ganamos/ganamosDogIcon.webp', bar: '/images/ganamos/app-icon.png', cls: 'prl-gn', dir: '/images/ganamos/', wordmark: true, layout: 'ganamos' },
        // #958 (owner: marca propia con el formato de thornet.uno): su diseño y su orden, con los juegos y la cuenta de Girox.
        buffaloplay: { name: 'BuffaloPlay', sub: '', logo: '/images/buffaloplay/logo.webp', home: '/images/buffaloplay/icon.svg', bar: '/images/buffaloplay/icon-192.png', cls: 'prl-bp', dir: '/images/buffaloplay/', wordmark: true, layout: 'buffaloplay' }
    };
    // #922: íconos ORIGINALES de la barra de ganamos.net (deporte, polymarket, casino, en vivo, digitain, gr8).
    const GN_IC = {"sport": "<svg width=\"20\" height=\"21\" viewBox=\"0 0 20 21\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\"><path d=\"M15.1335 1.7002H4.86686C2.845 1.7002 1.2002 3.345 1.2002 5.36686C1.2002 7.20055 2.55461 8.71968 4.31471 8.98734C4.73813 10.681 5.89686 12.082 7.43353 12.8341V15.1161C6.35985 15.5524 5.60019 16.6052 5.60019 17.8335V18.5669C5.60019 18.9717 5.92873 19.3002 6.33353 19.3002H13.6669C14.0717 19.3002 14.4002 18.9717 14.4002 18.5669V17.8335C14.4002 16.6052 13.6405 15.5524 12.5669 15.1161V12.8341C14.1035 12.082 15.2623 10.681 15.6857 8.98734C17.4458 8.71968 18.8002 7.20055 18.8002 5.36686C18.8002 3.345 17.1554 1.7002 15.1335 1.7002ZM2.66686 5.36686C2.66686 4.41099 3.28024 3.59798 4.13353 3.29523V7.43849C3.28024 7.13574 2.66686 6.32274 2.66686 5.36686ZM7.06686 17.8335C7.06686 17.0246 7.72464 16.3669 8.53353 16.3669H11.4669C12.2757 16.3669 12.9335 17.0246 12.9335 17.8335H7.06686ZM11.1002 14.9002H8.90019V13.3265C9.25701 13.3947 9.62404 13.4335 10.0002 13.4335C10.3764 13.4335 10.7434 13.3947 11.1002 13.3265V14.9002ZM10.0002 11.9669C7.57389 11.9669 5.60019 9.99316 5.60019 7.56686V3.16686H14.4002V7.56686C14.4002 9.99316 12.4265 11.9669 10.0002 11.9669ZM15.8669 7.43849V3.29523C16.7201 3.59798 17.3335 4.41099 17.3335 5.36686C17.3335 6.32274 16.7201 7.13574 15.8669 7.43849Z\" fill=\"white\"></path></svg>", "poly": "<svg width=\"20\" height=\"20\" viewBox=\"0 0 20 20\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\"><path fill-rule=\"evenodd\" clip-rule=\"evenodd\" d=\"M17.7708 19.5271L2.20312 15.2028V4.82435L17.7708 0.5V19.5271ZM3.93286 13.473V6.55409L15.1762 10.0136L3.93286 13.473ZM16.041 2.22974V9.14869L4.79773 5.68922L16.041 2.22974ZM16.041 17.7974V10.8784L4.79773 14.3379L16.041 17.7974Z\" fill=\"white\"></path></svg>", "casino": "<svg width=\"20\" height=\"20\" viewBox=\"0 0 20 20\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\"><g clip-path=\"url(#f6104ef7-a34c-4740-b294-140705fef964__clip0_10917_22561)\"><path d=\"M19.668 10.4419L19.668 10.4418L17.661 1.38124L17.661 1.38113C17.5814 1.02401 17.3635 0.713019 17.055 0.516387C16.7464 0.319756 16.3725 0.253542 16.0152 0.332272L16.0151 0.332296L6.95461 2.3393C6.77766 2.37849 6.61017 2.45215 6.46169 2.55608C6.31321 2.66001 6.18665 2.79217 6.08925 2.94501C5.99185 3.09786 5.92551 3.26839 5.89402 3.44687C5.86252 3.62535 5.8665 3.80828 5.90571 3.98522C5.90571 3.98523 5.90571 3.98523 5.90571 3.98523L6.71962 7.65967H1.68042H1.6803C1.31445 7.66008 0.963706 7.8056 0.705011 8.06429C0.446317 8.32299 0.300802 8.67373 0.300391 9.03958V9.0397L0.300391 18.3199L0.300391 18.32C0.300802 18.6858 0.446317 19.0366 0.705011 19.2953C0.963706 19.554 1.31445 19.6995 1.6803 19.6999H1.68042H10.9606H10.9607C11.3266 19.6995 11.6773 19.554 11.936 19.2953C12.1947 19.0366 12.3402 18.6858 12.3406 18.32V18.3199V13.4783L18.619 12.0877L18.6192 12.0876C18.9763 12.0081 19.2873 11.7902 19.4839 11.4816C19.6805 11.1731 19.7467 10.7992 19.668 10.4419ZM7.91266 13.0456L7.91267 13.0457C7.98062 13.3519 8.15078 13.6259 8.39516 13.8225C8.63953 14.0192 8.94356 14.1268 9.25724 14.1277L9.25759 14.1277C9.35883 14.1276 9.45975 14.1165 9.55858 14.0946L10.8609 13.8061L10.8614 18.2199H1.78042V9.1397H7.04749L7.91266 13.0456ZM18.2022 10.6641L9.33605 12.6279L7.37234 3.76264L16.2377 1.79881L18.2022 10.6641Z\" fill=\"white\" stroke=\"white\" stroke-width=\"0.2\"></path><path d=\"M2.96094 10.3196H4.56097V11.9196H2.96094V10.3196ZM2.96094 15.4397H4.56097V17.0397H2.96094V15.4397ZM8.08104 15.4397H9.68107V17.0397H8.08104V15.4397ZM5.52099 12.8797H7.12102V14.4797H5.52099V12.8797ZM8.77929 4.66217L10.3415 4.31641L10.6872 5.87864L9.12506 6.2244L8.77929 4.66217ZM14.8863 8.55117L16.4485 8.20516L16.7945 9.76735L15.2323 10.1134L14.8863 8.55117ZM11.8333 6.60517L13.3954 6.25916L13.7414 7.82131L12.1793 8.16732L11.8333 6.60517Z\" fill=\"white\"></path></g><defs><clipPath id=\"f6104ef7-a34c-4740-b294-140705fef964__clip0_10917_22561\"><rect width=\"20\" height=\"20\" fill=\"white\"></rect></clipPath></defs></svg>", "live": "<svg width=\"20\" height=\"21\" viewBox=\"0 0 20 21\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\"><path d=\"M13.6786 11.0255L13.1531 10.5L12.1021 11.551L13.1531 12.6021L14.2041 11.551L13.6786 11.0255ZM13.6786 11.0255L13.1531 11.6807M6.84685 9.00143L6.38403 8.00713C6.34256 7.91803 6.28845 7.83284 6.2066 7.77844C5.91796 7.58662 5.52481 7.61796 5.27031 7.87245C4.98007 8.16268 4.98007 8.63324 5.27031 8.92348L6.84685 10.5L8.42339 8.92348C8.71363 8.63324 8.71363 8.16268 8.42339 7.87245C8.1689 7.61796 7.77575 7.58662 7.48711 7.77844C7.40526 7.83284 7.35115 7.91803 7.30968 8.00713L6.84685 9.00143ZM6.84685 9.00143L5.62766 8.81838M6.84685 9.00143L7.98197 8.48205M8.07733 16.8062C8.51018 18.0308 9.67813 18.9082 11.051 18.9082H15.2551C16.9965 18.9082 18.4082 17.4965 18.4082 15.7551V7.34692C18.4082 5.60553 16.9965 4.19385 15.2551 4.19385H12.1021M3.60977 16.8062H10.0841C11.1986 16.8062 12.1021 15.9027 12.1021 14.7882V4.10977C12.1021 2.99527 11.1986 2.0918 10.0841 2.0918H3.60977C2.49528 2.0918 1.5918 2.99527 1.5918 4.10977V14.7882C1.5918 15.9027 2.49527 16.8062 3.60977 16.8062Z\" stroke=\"white\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\"></path></svg>", "sp1": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"22\" height=\"22\" viewBox=\"0 0 22 22\" fill=\"none\"><path d=\"M6.16577 1.83203V5.23372C6.16577 8.3607 8.20593 11.0191 10.9998 11.9955C13.7936 11.0191 15.8337 8.3607 15.8337 5.23372V1.83203H6.16577Z\" fill=\"#9583A0\"></path><path d=\"M5.93434 8.84374C4.19174 7.39559 3.07208 5.26889 2.92402 2.90625H5.09147V1.83203H1.83301V2.36914C1.83301 3.46184 2.01727 4.53326 2.38072 5.55362C2.73199 6.53979 3.24227 7.45664 3.8974 8.2787C4.86699 9.49536 6.1272 10.4555 7.54022 11.0723C6.88402 10.4231 6.34104 9.66913 5.93434 8.84374Z\" fill=\"#9583A0\"></path><path d=\"M16.9078 1.83203V2.90625H19.0752C18.9272 5.26889 17.8075 7.39559 16.0649 8.84374C15.6582 9.66917 15.1152 10.4231 14.459 11.0723C15.872 10.4555 17.1322 9.49536 18.1018 8.2787C18.757 7.45664 19.2673 6.53979 19.6185 5.55362C19.982 4.53326 20.1662 3.46184 20.1662 2.36914V1.83203H16.9078Z\" fill=\"#9583A0\"></path><path d=\"M15.1175 19.0903V14.7934H12.0739V12.7188C11.8402 12.8257 11.6002 12.9227 11.3541 13.0088L10.9997 13.1326L10.6453 13.0088C10.3991 12.9227 10.1592 12.8257 9.92545 12.7188V14.7934H6.88184V19.0903H5.80762V20.1645H16.1917V19.0903H15.1175ZM12.611 17.658H9.38834V16.5838H12.611V17.658Z\" fill=\"#9583A0\"></path></svg>", "sp2": "<svg width=\"22\" height=\"22\" viewBox=\"0 0 22 22\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\"><path d=\"M4.8754 6.33944C5.36773 6.9044 6.37859 8.04134 6.48342 8.06943C6.58825 8.09752 8.96082 6.86064 10.134 6.23868L8.3471 9.76258L11.5773 12.3837L7.56179 12.4313C7.43305 12.9118 7.13798 14.2489 6.98762 15.7535C6.56452 15.1485 5.66744 13.7355 5.46393 12.9225C5.2581 12.1003 5.10275 12.1192 4.7327 12.164C4.6454 12.1746 4.54615 12.1866 4.43147 12.1894C3.95083 12.2011 3.30652 12.0635 3.04444 11.9933C3.31593 11.5043 3.96561 10.4424 4.39245 10.1074C4.81657 9.77448 4.74283 9.06414 4.69387 8.59253C4.68124 8.47084 4.67025 8.36504 4.6699 8.28572C4.66959 8.21704 4.66525 8.12623 4.6602 8.02068L4.66019 8.02056C4.6368 7.53183 4.59828 6.72715 4.8754 6.33944Z\" fill=\"#9583A0\"></path><path fill-rule=\"evenodd\" clip-rule=\"evenodd\" d=\"M20.1435 7.9862C19.3983 5.72427 17.8389 3.83509 15.8133 2.66326C15.2953 2.36363 14.7466 2.11076 14.1731 1.91056C13.5635 1.69778 12.9262 1.54459 12.2682 1.45791C11.8528 1.40318 11.4295 1.375 11 1.375C8.544 1.375 6.30096 2.29605 4.60083 3.81021C3.07406 5.16998 1.9819 7.0107 1.56327 9.09702C1.43969 9.7129 1.375 10.3493 1.375 11C1.375 11.2128 1.38192 11.4241 1.39556 11.6336C1.45814 12.5953 1.66212 13.5193 1.98718 14.3846C2.85317 16.6896 4.57651 18.5727 6.76882 19.6473C7.46632 19.9892 8.21142 20.2493 8.9914 20.4149C9.64001 20.5527 10.3121 20.625 11 20.625C11.7632 20.625 12.5068 20.536 13.2205 20.3674C16.4854 19.5961 19.1053 17.1651 20.1435 14.0138C20.4562 13.0646 20.625 12.0511 20.625 11C20.625 10.0844 20.4969 9.19724 20.2571 8.35616C20.2216 8.2318 20.1838 8.10846 20.1435 7.9862ZM12.1512 2.34596C12.7479 2.42457 13.3255 2.56343 13.8779 2.75624C14.3977 2.93768 14.895 3.16688 15.3647 3.4386C17.2029 4.50195 18.6173 6.21634 19.2927 8.26647C19.3292 8.37727 19.3636 8.48905 19.3957 8.60175C19.4681 8.85574 19.5293 9.11445 19.5787 9.37733C19.6216 9.83544 19.6311 10.8363 19.3298 11.2307C18.9421 11.4545 18.0453 11.8837 17.5595 11.8097C17.2773 11.0127 16.5649 9.19392 15.9733 8.29488C16.0529 7.47355 15.725 5.44754 15.6624 5.26221C15.682 5.23237 15.7822 5.18195 16.0251 5.21895C16.3287 5.26519 17.0909 5.43432 17.58 5.7058C17.9104 5.99498 18.6712 6.79266 19.0701 7.67001C18.9247 7.31897 18.7547 6.97338 18.5596 6.63542C18.0514 6.0428 17.58 5.7058 17.58 5.7058C17.3007 5.3501 16.3821 4.43683 14.9412 3.6294C14.705 3.41502 14.1351 2.93175 13.7454 2.71369C13.6033 2.7219 13.2478 2.76837 12.9628 2.88862C12.3195 2.76562 10.6656 2.57416 9.19653 2.79236L8.21601 2.72479C7.67661 2.90688 7.14716 3.14471 6.63521 3.44028C6.46776 3.53696 6.30473 3.63835 6.14618 3.74418C6.06936 3.79546 5.99359 3.84778 5.91889 3.90111C7.35012 2.87487 9.10451 2.27073 11 2.27073C11.3902 2.27073 11.7745 2.29633 12.1512 2.34596ZM4.25527 5.45805C3.36362 6.54195 2.72816 7.84455 2.44149 9.27324C2.32949 9.83142 2.27073 10.4088 2.27073 11C2.27073 11.1934 2.27701 11.3852 2.28939 11.5755C2.28996 11.5842 2.29054 11.5929 2.29113 11.6016C2.37265 11.7231 2.63366 11.9668 3.04444 11.9933C2.89404 12.2463 2.61336 12.94 2.69383 13.6911C2.66066 13.5891 2.62948 13.4867 2.60026 13.3841C2.66615 13.6166 2.74143 13.8453 2.82568 14.0695C3.23851 15.1684 3.86655 16.1619 4.65846 16.9988C5.29275 17.4487 6.64746 18.2872 7.06347 18.0912C6.93171 17.4472 6.73206 16.0782 6.98762 15.7535C7.52849 16.5304 8.71154 18.1255 9.11681 18.2902C9.62341 18.4962 12.2741 17.9073 12.8077 17.4885C12.6762 17.8044 12.1177 18.5957 10.9355 19.234C11.1009 19.3925 11.6993 19.6769 12.7714 19.5494C12.8529 19.5326 12.9339 19.5147 13.0145 19.4957C14.6655 19.1057 16.1353 18.2469 17.2758 17.0675L17.414 16.5459L17.5127 16.8127C18.3017 15.9292 18.9136 14.8843 19.2927 13.7335C19.576 12.8737 19.7293 11.9548 19.7293 11.0001L19.3298 11.2307C18.9585 12.4198 18.2116 13.5747 17.8846 14.0035C18.0001 15.3546 17.619 16.2614 17.414 16.5459C17.0317 16.1906 16.4791 15.8857 16.2505 15.7777C14.1917 17.2765 13.0974 17.5427 12.8077 17.4885C13.6038 16.7187 14.3244 15.1913 14.5852 14.5239C13.7451 13.9898 12.2299 12.8745 11.5773 12.3837C12.7906 12.3108 15.2504 12.146 15.3833 12.0693C15.4089 12.0545 15.4297 12.0451 15.4473 12.0372C15.4645 12.0294 15.4787 12.023 15.4913 12.0143C15.5492 11.9741 15.5732 11.8848 15.7075 11.3837C15.8619 10.8071 15.9491 9.08424 15.9733 8.29488C14.5057 6.04074 14.015 5.38257 13.6634 5.25326C13.2739 5.10998 11.0665 5.90336 10.134 6.23868C10.6058 5.39801 11.1065 4.83136 11.4447 4.44871C11.7327 4.12282 11.9027 3.93038 11.8366 3.81575C11.3583 3.29436 9.87727 2.91624 9.19653 2.79236C8.43977 2.78621 6.84765 3.42434 6.14618 3.74418C5.29101 4.56521 4.94267 5.81645 4.8754 6.33944C4.73347 6.22126 4.41113 5.87981 4.25527 5.45805ZM10.0924 19.6827C8.90011 19.5571 7.74099 19.1874 6.69351 18.5948C6.84717 18.6821 7.00375 18.7649 7.16305 18.843C7.79534 19.1529 8.4706 19.3886 9.1775 19.5387C9.47706 19.6024 9.78231 19.6506 10.0924 19.6827Z\" fill=\"#9583A0\"></path></svg>"};
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
            // #961 (owner): la barra de PICA ROJA también arriba de JUGAYGANA en la app (en el sitio JUGAYGANA no: no hay app detrás).
            (sk.layout === 'jugaygana' && window.VIP_SITE === 'jugaygana' ? '' : '<div class="casino-topbar prl-cbar">' + ((VIP.home && VIP.home.casinoBarHtml) ? VIP.home.casinoBarHtml({ back: 'VIP.lobby.close()', menu: (window.VIP_SITE === 'jugaygana' ? 'VIP.lobby.menu(true)' : 'VIP.home.casinoFullMenu()'), logo: sk.bar, name: sk.name, idSuffix: 1 }) : '<div class="casino-topbar-row"><button type="button" class="casino-back" onclick="VIP.lobby.close()">‹ Volver</button></div>') + '</div>') +
            // #956 (owner: "armalo como jugaygana44, con su menú de arriba, sin el saldo"): logo · soporte · mensajes (historias) · usuario con
            // Carga rápida · ☰ (cuenta, cargar/retirar, deportes, perfil, info y volver). La barra de la app no va en JUGAYGANA.
            (sk.layout === 'jugaygana' ? '<header class="prl-top jg-head"><button type="button" class="prl-brandbtn" onclick="VIP.lobby.go(\'inicio\')" aria-label="Inicio"><img src="' + sk.logo + '" alt="' + sk.name + '" class="prl-wordmark"></button>' +
                '<div class="jg-hr">' + // F982 (owner, captura de jugaygana44): sin el botón de Soporte; su "INGRESAR" es nuestro CARGA RÁPIDA

                '<button type="button" class="jg-hi" onclick="VIP.stories.open()" aria-label="Mensajes"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="1.5"/><path d="M3.5 6l8.5 7 8.5-7"/></svg></button>' +
                '<span class="jg-bal" aria-label="Saldo"><b class="js-prl-bal">—</b></span><button type="button" class="jg-qlbtn" onclick="VIP.lobby.ql()">CARGA RÁPIDA</button>' + // F984: el saldo al lado
                '<button type="button" class="jg-burger" onclick="VIP.lobby.menu(true)" aria-label="Menú"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg></button></div></header>' : '') +
            // #958: BuffaloPlay como thornet: ☰ · actualizar saldo · saldo (= Carga rápida) · chat (Soporte) · usuario (cuenta).
            // #960 (owner: "arriba la barra de PICA ROJA como en todos"): esta va debajo de esa barra, sin el logo.
            (sk.layout === 'buffaloplay' ? '<header class="prl-top bp-head"><button type="button" class="bp-hb" onclick="VIP.lobby.bpNav(true)" aria-label="Menú"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 6h17M3.5 12h17M3.5 18h17"/></svg></button>' +
                '<div class="bp-hr"><button type="button" class="bp-ref" onclick="VIP.lobby.bpRefresh(this)" aria-label="Actualizar saldo"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.5 9A8 8 0 0 0 5 7.5M4.5 15A8 8 0 0 0 19 16.5"/><path d="M5 3v4.5h4.5M19 21v-4.5h-4.5"/></svg></button>' +
                '<button type="button" class="bp-bal" onclick="VIP.lobby.ql()" aria-label="Saldo · Carga rápida"><b class="js-prl-bal">—</b><small>CARGA RÁPIDA</small></button>' +
                '<button type="button" class="bp-hi" onclick="VIP.lobby.support()" aria-label="Soporte"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4.5c-5 0-8.5 3.1-8.5 7 0 1.9.9 3.6 2.4 4.9L5 20l4.1-2c.9.3 1.9.4 2.9.4 5 0 8.5-3.1 8.5-6.9s-3.5-7-8.5-7z"/><circle cx="8.3" cy="11.5" r="1.1" class="f"/><circle cx="12" cy="11.5" r="1.1" class="f"/><circle cx="15.7" cy="11.5" r="1.1" class="f"/></svg></button>' +
                '<button type="button" class="bp-hi" onclick="VIP.lobby.menu(true)" aria-label="Mi cuenta"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 20.5c.8-4 4-6 8-6s7.2 2 8 6"/></svg></button></div></header>' : '') +
            // #917 (owner): sin la fila de saldo / Cargar (se carga con la Carga rápida); JUGAYGANA y Ganamos mantienen su barra con el logo.
            (sk.wordmark && sk.layout !== 'jugaygana' && sk.layout !== 'buffaloplay' ? '<header class="prl-top prl-top-logo"><button type="button" class="prl-brandbtn" onclick="VIP.lobby.go(\'inicio\')" aria-label="Inicio"><img src="' + sk.logo + '" alt="' + sk.name + '" class="prl-wordmark"></button>' +
                '<span class="prl-hbal" aria-label="Saldo"><b class="js-prl-bal">—</b></span>' +
                // #952 (owner): la Carga rápida ARRIBA, al lado del saldo, fina y con el formato de la página (sin burbuja flotante)
                '<button type="button" class="prl-hql" onclick="VIP.lobby.ql()">' + ico('wallet') + '<span>CARGA RÁPIDA</span></button></header>' : '') + // #920 (owner): el saldo como figura en cada página
            (sk.wordmark ? '' : '<div class="prl-pr-bal" id="prlPrBal"></div>') + // #920: PICA ROJA = la misma tira de saldo del Inicio de la app
            '<main class="prl-main" id="prlMain"></main>' +
            '<button type="button" class="prl-top-btn" id="prlUp" hidden onclick="VIP.lobby.top()" aria-label="Volver arriba">' + ico('up') + '</button>' +
            // #914: Carga rápida (mismo panel, CBU, comprobante y retiro que adentro del casino) con el logo de la marca.
            (sk.wordmark ? '' : '<button type="button" class="prl-ql" id="prlQl" onclick="VIP.lobby.ql()" title="Carga rápida · arrastrame si te tapa algo"><img src="' + sk.bar + '" alt=""><span>CARGA RÁPIDA</span></button>') + // #952: JUGAYGANA/Ganamos la tienen arriba
            (sk.layout === 'jugaygana' ? '' : sk.layout === 'buffaloplay' ? '<div class="bp-navwrap" id="bpNav" hidden onclick="if(event.target===this)VIP.lobby.bpNav(false)"><aside class="bp-nav" role="dialog" aria-label="Menú"></aside></div>' : sk.layout === 'ganamos'
                ? (() => { // #922 (owner): la barra de abajo REAL de ganamos.net (su fondo con el hueco de la mascota, sus íconos, su orden y su brillo)
                    const it = (v, k, t, on) => '<button type="button" class="gnm__menu-item" data-v="' + v + '" onclick="' + on + '"><img class="gnm__menu-active" src="/images/ganamos/menu-active.webp" alt=""><div class="gnm__menu-icon-container"><span class="gnm__menu-icon">' + (k ? GN_IC[k] : '') + '</span></div><span class="gnm__menu-text">' + t + '</span></button>';
                    return '<div class="gnm prl-gnm">' +
                        '<button type="button" class="gnm__ganamos-dog" onclick="VIP.lobby.go(\'inicio\')" aria-label="Inicio"><img class="gnm__ganamos-dog-img" src="' + sk.home + '" alt=""></button>' +
                        '<div class="gnm__background"><span class="gnm__background-part gnm__background-part_type_left"></span><span class="gnm__background-part gnm__background-part_type_fill-left"></span><span class="gnm__background-part gnm__background-part_type_center"></span><span class="gnm__background-part gnm__background-part_type_fill-right"></span><span class="gnm__background-part gnm__background-part_type_right"></span></div>' +
                        '<nav class="gnm__main" aria-label="Menú">' + it('deportes', 'sport', 'Deporte', 'VIP.lobby.sportsMenu(event)') + it('sorteos', 'poly', 'Sorteos', "VIP.lobby.go('sorteos')") + it('inicio', '', 'Inicio', "VIP.lobby.go('inicio')") + it('slots', 'casino', 'Casino', "VIP.lobby.go('slots')") + it('vivo', 'live', 'Casino en vivo', "VIP.lobby.go('vivo')") + '</nav></div>';
                  })()
                : '<nav class="prl-nav" aria-label="Menú">' + nb('slots', 'slots', 'Slots') + nb('vivo', 'live', 'En vivo') +
                  '<button type="button" data-v="inicio" class="prl-home" onclick="VIP.lobby.go(\'inicio\')"><img src="' + sk.home + '" alt=""><span>Inicio</span></button>' +
                  '<button type="button" data-v="deportes" onclick="VIP.lobby.sportsMenu(event)">' + ico('sport') + '<span>Deportes</span></button>' + nb('lobbies', 'grid', 'Lobby') + // #920: sin perfil en las páginas; Casino lobby
                  '</nav>') +
            '<div class="prl-drawer" id="prlDrawer" hidden onclick="if(event.target===this)VIP.lobby.menu(false)"><aside class="prl-dr" role="dialog" aria-label="Mi cuenta"><div id="prlDrBody"></div></aside></div>' +
            '</div>');
        return $('prLobby');
    }
    function _balText() { try { const src = $('userBalance'); return src && src.textContent ? src.textContent.replace(/^\s*Saldo:?\s*/i, '') : '—'; } catch (_) { return '—'; } }
    function _uname() { try { return String((VIP.state && VIP.state.currentUser && VIP.state.currentUser.username) || '').toUpperCase(); } catch (_) { return ''; } }
    function _paintBal() {
        try { const u = _uname(); document.querySelectorAll('.js-prl-user').forEach((e) => { if (u && e.textContent !== u) e.textContent = u; }); } catch (_) {}
        try { const t = _balText(); document.querySelectorAll('.js-prl-bal').forEach((e) => { e.textContent = t; }); } catch (_) {}
        try { // #920: PICA ROJA copia la tira de saldo del Inicio de la app (mismo diseño), sin el botón de instalar
            const box = $('prlPrBal'); const src = document.querySelector('#homeFull .balance-strip');
            if (box && src) { const c = src.cloneNode(true); c.querySelectorAll('[id]').forEach((e) => e.removeAttribute('id')); c.querySelectorAll('.bs-install, button').forEach((e) => e.remove()); box.innerHTML = ''; box.appendChild(c); }
        } catch (_) {}
    }
    function _card(g) {
        return '<button type="button" class="prl-g" onclick="VIP.lobby.play(\'' + esc(g.key) + '\', this)" data-name="' + esc(g.name) + '"' + (g.gid ? ' data-gid="' + Number(g.gid) + '" data-lk="' + esc(g.lk || '') + '"' : '') + ' title="' + esc(g.name) + '" aria-label="' + esc(g.name) + '">' +
            '<span class="prl-gi">' + (g.img ? '<img loading="lazy" decoding="async" src="' + esc(img(g.img)) + '" alt="" onerror="this.remove()">' : '') + (g.isNew ? '<em class="prl-new">NUEVO</em>' : '') + '<i>' + esc(g.name) + '</i></span></button>';
    }
    function _title(icon, title, onclick) {
        return '<div class="prl-sh">' + (onclick ? '<button type="button" class="prl-st" onclick="' + onclick + '">' : '<span class="prl-st">') + ico(icon) + '<h3>' + esc(title) + '</h3>' + (onclick ? '<b class="prl-chev">›</b></button>' : '</span>') + '</div>';
    }
    // #909: secciones como Stake: de a 4 por fila (#911); "Ver más" despliega de a 8 (el orden de los juegos es el de Girox: más jugados primero).
    let _secN = 0;
    function _row(icon, title, games, providerId, onTitle) {
        if (!games || !games.length) return '';
        const id = 'prlS' + (++_secN);
        return '<section class="prl-sec">' + _title(icon, title, onTitle || (providerId ? 'VIP.lobby.all(' + Number(providerId) + ', \'' + jsq(title) + '\')' : null)) +
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
        if (SK().layout === 'jugaygana' || SK().layout === 'buffaloplay') return '';
        return '<div class="prl-hero" id="prlHero">' + BANNERS_OF().map((b) => '<button type="button" class="prl-slide" onclick="VIP.lobby.go(\'' + b[1] + '\')"><img src="' + b[0] + '" alt="' + SK().name + '" decoding="async"></button>').join('') + '</div>';
    }
    // #909: proveedores como Stake (logo sin color, en recuadro) — se despliegan con "Ver más" y llevan a sus juegos.
    function _provTile(p) {
        // #910: los logos de Girox son casi todos íconos (sin el nombre): ícono chico en gris + NOMBRE en texto, para que se entienda.
        return '<button type="button" class="prl-pv" onclick="' + (p.on || 'VIP.lobby.all(' + Number(p.id) + ', \'' + jsq(p.name) + '\')') + '" aria-label="' + esc(p.name) + '">' +
            '<span class="prl-pvb">' + (p.logo ? '<img loading="lazy" src="/api/games/img?u=' + encodeURIComponent(p.logo) + '" alt="" onerror="this.remove()">' : '') + '<b>' + esc(p.name) + '</b></span>' +
            '<small><i class="prl-dot"></i>' + Number(p.count || 0).toLocaleString('es-AR') + ' juegos</small></button>';
    }
    function _providers(list, noMore) {
        const ps = (list || []).filter((p) => p.count > 0); if (!ps.length) return '';
        if (noMore) return '<section class="prl-sec">' + _title('tag', 'Proveedores', null) + '<div class="prl-pvs">' + ps.map(_provTile).join('') + '</div></section>'; // #925: fila deslizable, todos
        const shown = _provOpen ? ps : ps.slice(0, 8);
        return '<section class="prl-sec">' + _title('tag', 'Proveedores', null) + '<div class="prl-pvs' + (_provOpen ? ' open' : '') + '">' + shown.map(_provTile).join('') + '</div>' +
            (ps.length > 8 ? '<div class="prl-more"><button type="button" onclick="VIP.lobby.provToggle()">' + (_provOpen ? 'Ver menos' : 'Ver más (' + ps.length + ')') + '</button></div>' : '') + '</section>';
    }
    // #920 (owner): "en todas, una sección Casino lobby con los mismos lobbies que tiene Girox". Salen del catálogo de 1girox (búsqueda "lobby").
    function _lobbies() { return ((_data && _data.lobbies) || []); }
    function _backBar() { return '<div class="prl-backbar"><button type="button" class="prl-backbtn" onclick="VIP.lobby.back()">‹ Volver</button></div>'; }
    // #922 (owner): "Deportes que no se abra así en ninguno: que aparezcan las dos de Girox chiquito para elegir y abra directo".
    function sportsMenu(ev) {
        try { if (ev) { ev.stopPropagation(); ev.preventDefault(); } } catch (_) {}
        const old = $('prlSportPop'); if (old) { old.remove(); return; }
        const sp = _sportsList();
        const gn = SK().layout === 'ganamos';
        const html = '<div id="prlSportPop" class="' + (gn ? 'gnm__more prl-sportpop-gn' : 'prl-sportpop') + '" role="menu"><div class="' + (gn ? 'gnm__more-list' : 'prl-sportpop-l') + '">' +
            sp.map((x, i) => '<button type="button" class="' + (gn ? 'gnm__more-item' : 'prl-sportpop-i') + '" role="menuitem" onclick="event.stopPropagation();VIP.lobby.sportPick(\'' + esc(x.path) + '\')">' + (gn ? '<span class="gnm__more-icon">' + GN_IC[i ? 'sp2' : 'sp1'] + '</span><span class="gnm__more-text">' + esc(x.title) + '</span>' : ico('sport') + '<span>' + esc(x.title) + '</span>') + '</button>').join('') + '</div></div>';
        const btn = ev && ev.currentTarget && ev.currentTarget.closest ? ev.currentTarget : null;
        const host = (btn && (btn.closest('.gnm__menu-item') || btn.closest('button'))) || null;
        if (host && (host.closest('.gnm__main') || host.closest('.prl-nav'))) { host.style.position = 'relative'; host.insertAdjacentHTML('beforeend', html); }
        else { const m = $('prLobby'); if (m) m.insertAdjacentHTML('beforeend', html.replace('class="', 'class="prl-sportpop-center ')); }
        setTimeout(() => { document.addEventListener('click', function off(e) { const p = $('prlSportPop'); if (p && !p.contains(e.target)) p.remove(); document.removeEventListener('click', off, true); }, true); }, 0);
    }
    // #966: las casas de deportes aunque la lista del server todavía no haya llegado (cada una abre con su link directo, #962)
    function _sportsList() { const l = (_data && _data.sports) || []; return l.length ? l : [{ path: '/sports-new', title: 'Digitain' }, { path: '/sports', title: 'Ultim8' }]; }
    function sportPick(path) { const p = $('prlSportPop'); if (p) p.remove(); sport(path); }
    function back() { if (SK().layout === 'buffaloplay' && _view === 'jglist') { go('vivo'); return; } if (_view === 'all' && (_allProv || _allCat) && !_allCat) { go('slots'); return; } go('inicio'); }
    function _search() {
        return '<label class="prl-search">' + ico('search') + '<input type="search" id="prlQ" placeholder="Buscar juegos" autocomplete="off" value="' + esc(_q) + '" oninput="VIP.lobby.search(this.value)"></label><div id="prlRes"></div>';
    }
    // ===== #914 Ganamos: mismo orden que su página (promos/sorteos arriba, accesos Casino / Casino en vivo, 3 juegos + Deporte,
    // Depósito · Retiro · Chat, y filas deslizantes de a 4: Especialmente para vos, Primicias, Rubyplay, Amusnet, Pragmatic, Amigo Gaming,
    // XPG, Destacadas, Del Joker, Clásicas, Pragmatic Live). Lo que en su página es exclusivo de su sistema (juegos propios, torneos,
    // sorteos) acá queda como "PRÓXIMAMENTE" hasta tener su API.
    // #917 (owner): arriba de cada página, los DOS sorteos (el mensual activo y el Gran Sorteo "próximamente"), con el estilo de la marca.
    function _rfStrip() { // fusión: los sorteos de la gemela (G915, sorteos.js) — dos mitades Gran Sorteo | Sorteo mensual; las pinta VIP.sorteos.load()
        setTimeout(() => { try { VIP.sorteos.load(); } catch (_) {} }, 0);
        return '<div class="srt-banner prl-srt" data-srt-banner hidden></div>';
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
        return '<section class="gn-sec"><div class="gn-sh"><span>' + esc(title) + '</span>' + (onclick ? '<button type="button" onclick="' + onclick + '">Mostrar todo ›</button>' : '') + '</div>' +
            '<div class="gn-car" id="' + id + '" onscroll="VIP.lobby.gcarScroll(this)">' + games.slice(0, 24).map((g) => '<button type="button" class="gn-g" onclick="VIP.lobby.play(\'' + esc(g.key) + '\', this)" data-name="' + esc(g.name) + '"' + (g.gid ? ' data-gid="' + Number(g.gid) + '" data-lk="' + esc(g.lk || '') + '"' : '') + ' aria-label="' + esc(g.name) + '"><span>' + (g.img ? '<img loading="lazy" decoding="async" src="' + esc(img(g.img)) + '" alt="" onerror="this.remove()">' : '') + '<i>' + esc(g.name) + '</i></span><b class="gn-gname">' + esc(g.name) + '</b></button>').join('') + '</div>' + // #947: el nombre debajo, como su página
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
            (tiles.length ? '<div class="gn-tiles">' + tiles.map((g) => '<button type="button" class="gn-tile" onclick="VIP.lobby.play(\'' + esc(g.key) + '\', this)" data-name="' + esc(g.name) + '"' + (g.gid ? ' data-gid="' + Number(g.gid) + '" data-lk="' + esc(g.lk || '') + '"' : '') + ' aria-label="' + esc(g.name) + '">' + (g.img ? '<img src="' + esc(img(g.img)) + '" alt="">' : '<i>' + esc(g.name) + '</i>') + '</button>').join('') + '</div>' : '') +
            // #922 (owner): en Ganamos sin Deportes / Depósito / Retiro / Chat (se carga con la burbuja; deportes en la barra de abajo)

            _gcar('Casino lobby', _lobbies(), 'VIP.lobby.go(\'lobbies\')') + // #920
            // #923 (owner): "los juegos especiales de Girox no van" ⇒ sin "Especialmente para vos" (eran los más jugados de Girox, no la lista de Ganamos)

            '<div id="gnRows">' + _gnRowsHtml() + '</div>';
    }
    function _gnRowsHtml() {
        if (!_gnHomeData) return '';
        // #938 (owner: "Ver todo va a otra sección"): muestra los juegos de ESA fila (antes: todo el catálogo o todo el proveedor).
        return '<div id="gnExtraH">' + _gnExtraHtml('gnExtraH') + '</div>' + (_gnHomeData.rows || []).map((r, ri) => (r.hw ? _gnHalloween(r, ri) : _gcar(r.title, r.games, 'VIP.lobby.gnRow(' + ri + ')'))).join(''); // #948
    }
    // #949: tarjeta de Ganamos (portada + nombre debajo) y datos de sus proveedores (/data/ganamos-games.json: [key, nombre, portada, gid, lk]).
    function _gnCard(g) {
        return '<button type="button" class="gn-g" onclick="VIP.lobby.play(\'' + esc(g.key) + '\', this)" data-name="' + esc(g.name) + '"' + (g.gid ? ' data-gid="' + Number(g.gid) + '" data-lk="' + esc(g.lk || '') + '"' : '') + ' aria-label="' + esc(g.name) + '"><span>' + (g.img ? '<img loading="lazy" decoding="async" src="' + esc(img(g.img)) + '" alt="" onerror="this.remove()">' : '') + '<i>' + esc(g.name) + '</i></span><b class="gn-gname">' + esc(g.name) + '</b></button>';
    }
    const _gnG = (a) => ({ key: a[0], name: a[1], img: a[2], gid: a[3], lk: a[4] });
    let _gnGames = null, _gnGamesP = null;
    function _gnGamesLoad() {
        if (!_gnGamesP) _gnGamesP = fetch('/data/ganamos-games.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => null).then((d) => { _gnGames = d; return d; });
        return _gnGamesP;
    }
    function gnProv(i) { _gnGamesLoad().then((d) => { const p = d && d.providers && d.providers[i]; if (p) jgList(p.n, p.g.map(_gnG)); }); }
    // #948: "Juegos nuevos" (lo de Girox que Ganamos no tiene) — en el inicio y arriba de Casino.
    function _gnExtraHtml(boxId) {
        if (!_xtra.ganamos) { _extraLoad('ganamos').then(() => { const b = $(boxId); if (b && b.isConnected) b.innerHTML = _gnExtraHtml(boxId); }); return ''; }
        return _gcar('Juegos nuevos', _xtra.ganamos.slice(0, 24), 'VIP.lobby.extraAll(\'ganamos\')');
    }
    // #949 (owner: "Ganamos idéntica"): la pestaña Casino como su página: un bloque por proveedor (2 filas de 3) con "Mostrar todo".
    function _gnCasinoHtml() {
        if (!_gnGames) { _gnGamesLoad().then(() => { if (_skin === 'ganamos' && _view === 'slots') _render(); }); return _backBar() + '<div class="prl-note">Cargando…</div>'; }
        return _backBar() + _search() + '<div id="gnExtraC">' + _gnExtraHtml('gnExtraC') + '</div>' + ((_gnGames && _gnGames.providers) || []).map((p, i) =>
            '<section class="gn-sec"><div class="gn-sh"><span>' + esc(p.n) + '</span><button type="button" onclick="VIP.lobby.gnProv(' + i + ')">Mostrar todo ›</button></div><div class="gn-grid6">' + p.g.slice(0, 6).map((a) => _gnCard(_gnG(a))).join('') + '</div></section>').join('');
    }
    // #947: "Especial de Halloween" como en ganandoargentina.com (fondo, título, marco con sus juegos, el perro y JUGÁ YA = la lista de esa fila).
    function _gnHalloween(r, ri) {
        const H = '/images/ganamos/hw/';
        return '<section class="gn-hw"><img class="gn-hw-bg" src="' + H + 'halloween-bg.webp" alt="" loading="lazy"><div class="gn-hw-frame"><img class="gn-hw-title" src="' + H + 'halloween-title.webp" alt="' + esc(r.title) + '">' +
            '<div class="gn-hw-list">' + r.games.map((g) => '<button type="button" class="gn-hw-g" onclick="VIP.lobby.play(\'' + esc(g.key) + '\', this)" data-name="' + esc(g.name) + '"' + (g.gid ? ' data-gid="' + Number(g.gid) + '" data-lk="' + esc(g.lk || '') + '"' : '') + ' aria-label="' + esc(g.name) + '">' + (g.img ? '<img src="' + esc(img(g.img)) + '" alt="" loading="lazy">' : '') + '</button>').join('') + '</div></div>' +
            '<img class="gn-hw-border" src="' + H + 'halloween-frame.webp" alt=""><button type="button" class="gn-hw-btn" onclick="VIP.lobby.gnRow(' + ri + ')"><img src="' + H + 'halloween-button.webp" alt="Jugá ya"></button><img class="gn-hw-dog" src="' + H + 'halloween-dog.webp" alt=""></section>';
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
    // #937 (owner, zip de jugaygana44): proveedores (en su orden, con su logo) y categorías de la barra con SUS juegos y SUS portadas, cada uno
    // cruzado con el MISMO juego de Girox (se abre con su enlace, sin que se vea Girox). Lo que Girox no tiene no aparece (owner).
    // /data/jugaygana-games.json: { providers: [{ n, logo, g: [[key, name, imgId]] }], cats: { <catKey>: [[key, name, imgId]] } }.
    let _jgGames = null, _jgGamesP = null;
    function _jgGamesLoad() {
        if (_jgGames) return Promise.resolve(_jgGames);
        if (!_jgGamesP) _jgGamesP = fetch('/data/jugaygana-games.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => null).then((d) => { _jgGames = d; return d; });
        return _jgGamesP;
    }
    const _jgG = (a) => ({ key: a[0], name: a[1], img: typeof a[2] === 'number' ? '/images/jugaygana/g/' + a[2] + '.webp' : a[2], gid: a[3], lk: a[4] }); // #944: + id y launcher de 1girox · #967: portada de Girox si JUGAYGANA no tiene la suya
    function jgProvOpen(i) { _jgGamesLoad().then((d) => { const p = d && d.providers && d.providers[i]; if (!p) return; jgProv(false); if (p.g) jgList(p.n, p.g.map(_jgG)); else if (p.pid) all(p.pid, p.n); }); } // sin leer todavía: sus juegos de Girox
    function _jgProvListHtml() {
        if (!_jgGamesP) { _jgGamesLoad().then(() => { const l = $('jgProvList'); if (l) l.innerHTML = _jgProvListHtml(); }); return '<div class="prl-note">Cargando…</div>'; }
        if (!(_jgGames && (_jgGames.providers || []).length)) { // sin datos copiados: los proveedores de Girox, como antes
            return ((_data && _data.providers) || []).filter((p) => !p.live).map((p) => '<button type="button" onclick="VIP.lobby.jgProv(false);VIP.lobby.all(' + Number(p.id) + ', \'' + jsq(p.name) + '\')"><span>' + esc(p.name) + '</span><small>' + Number(p.count || 0) + '</small></button>').join('');
        }
        return (_jgGames.providers || []).map((p, i) => '<button type="button" onclick="VIP.lobby.jgProvOpen(' + i + ')"><span class="jg-pl">' + (p.logo ? '<img src="' + esc(p.logo) + '" alt="" loading="lazy">' : '') + esc(p.n) + '</span><small>' + (p.g ? p.g.length : Number(p.cnt || 0)) + '</small></button>').join('');
    }
    function _jgCard(g) { // #918: como su tarjeta: imagen cuadrada, el nombre abajo sobre un degradé
        return '<button type="button" class="jg-card" onclick="VIP.lobby.play(\'' + esc(g.key) + '\', this)" data-name="' + esc(g.name) + '"' + (g.gid ? ' data-gid="' + Number(g.gid) + '" data-lk="' + esc(g.lk || '') + '"' : '') + ' aria-label="' + esc(g.name) + '"><span>' + (g.img ? '<img loading="lazy" decoding="async" src="' + esc(img(g.img)) + '" alt="" onerror="this.remove()">' : '') + '<i>' + esc(g.name) + '</i></span><em><b>' + esc(g.name) + '</b></em></button>'; // #954: el nombre va DEBAJO de la portada (nunca encima)
    }
    function jgArrow(btn, dir) { const row = btn.parentNode && btn.parentNode.querySelector('.jg-row'); if (row) { try { row.scrollBy({ left: dir * row.clientWidth * 0.9, behavior: 'smooth' }); } catch (_) { row.scrollLeft += dir * row.clientWidth * 0.9; } } }
    // #918: barra de categorías (sus íconos y su orden). TORNEOS = el sorteo; el resto = catálogo de Girox (búsqueda u orden).
    function jgCat(key) {
        const it = ((_jgHomeData && _jgHomeData.catnav) || []).find((x) => x.key === key); if (!it) return;
        if (it.home) { go('inicio'); return; }
        if (it.raffle) { try { VIP.sorteos.open('mensual'); } catch (_) {} return; }
        _jgGamesLoad().then((d) => { // #937: la lista copiada de jugaygana44 si existe; si no, el catálogo de Girox como antes
            const L = d && d.cats && d.cats[key];
            if (L && L.length) { jgList(it.label, L.map(_jgG), key); return; }
            _allProv = null; _allCat = { label: it.label, q: it.q || '', sort: it.sort || '', key }; _view = 'all'; _render(); const m = $('prlMain'); if (m) m.scrollTop = 0;
        });
    }
    // #957 (owner: "como en las fotos"): el pie de su página: logo, derechos y los accesos por Secciones / Juegos / Deportes (todo abre acá).
    function _jgFooter() {
        const l = (t, on) => '<button type="button" onclick="' + on + '">' + esc(t) + '</button>';
        const sp = ((_data && _data.sports) || []).map((x) => l(x.title, "VIP.lobby.sport('" + esc(x.path) + "')")).join('');
        return '<footer class="jg-foot"><img src="' + SK().logo + '" alt="JUGAYGANA" class="jg-foot-logo" loading="lazy"><p>' + new Date().getFullYear() + ' Todos los derechos reservados.</p>' +
            '<div class="jg-foot-cols"><div><b>Secciones</b>' + l('Casino', "VIP.lobby.go('slots')") + l('Casino en Vivo', "VIP.lobby.go('vivo')") + l('Torneos', "VIP.lobby.jgCat('torneos')") + '</div>' +
            '<div><b>Juegos</b>' + l('Tragamonedas', "VIP.lobby.go('slots')") + l('Ruletas', "VIP.lobby.jgCat('ruletas')") + l('Jackpots', "VIP.lobby.jgCat('jackpots')") + l('Juegos de mesa', "VIP.lobby.jgCat('mesa')") + '</div>' +
            (sp ? '<div><b>Deportes</b>' + sp + '</div>' : '') + '</div></footer>';
    }
    function _jgCatnav(active) {
        const items = (_jgHomeData && _jgHomeData.catnav) || []; if (!items.length) return '';
        return '<nav class="jg-catnav" aria-label="Categorías"><div class="jg-catnav-s">' + items.map((it) => '<button type="button" class="jg-catnav-i' + (it.key === active ? ' on' : '') + '" onclick="VIP.lobby.jgCat(\'' + it.key + '\')"><span class="jg-catnav-ic"><svg viewBox="0 0 24 24" width="24" height="24" fill="none">' + it.svg + '</svg></span><span class="jg-catnav-l">' + esc(it.label) + '</span></button>').join('') + '</div><div class="jg-catnav-t"><i></i></div></nav>';
    }
    function _jgHome() {
        const d = _jgHomeData || {};
        const slides = d.slides || [];
        const t = (x) => '<h2 class="jg-t">' + esc(x) + '</h2>';
        const cols = (d.collections || []).map((c, ci) => {
            // #941 (owner: "idéntica a jugaygana44"): como en su inicio, las filas forman UNA grilla que se llena por COLUMNAS (1º arriba, 2º abajo,
            // 3º arriba…) y se desliza entera; "TODOS" sólo donde su página lo tiene (no en Populares ni Halloween).
            const games = c.games || []; const n = Math.min(5, Math.max(1, Number(c.rows) || 1));
            const noAll = /populares|halloween/i.test(c.title || '');
            return '<section class="jg-sec' + (c.bg ? ' jg-sec-bg' : '') + '">' + (c.bg ? '<img class="jg-sec-bgi" src="' + esc(c.bg) + '" alt="" loading="lazy">' + (c.art ? '<img class="jg-sec-art" src="' + esc(c.art) + '" alt="" loading="lazy">' : '') : '') +
                '<div class="jg-sec-h"><div><h2 class="jg-st">' + (c.icon ? '<img class="jg-st-ic" src="' + esc(c.icon) + '" alt="">' : '') + esc(c.title) + '</h2><span class="jg-line"></span></div>' + (noAll ? '' : '<button type="button" class="jg-all" onclick="VIP.lobby.jgColl(' + ci + ')">TODOS</button>') + '</div>' + // #936: sólo los de esa sección
                '<div class="jg-rows"><div class="jg-rowwrap"><button type="button" class="jg-arr jg-arr-l" onclick="VIP.lobby.jgArrow(this,-1)" aria-label="Anteriores">‹</button><div class="jg-row jg-row-g" style="--jr:' + n + '">' + games.map(_jgCard).join('') + '</div><button type="button" class="jg-arr jg-arr-r" onclick="VIP.lobby.jgArrow(this,1)" aria-label="Siguientes">››</button></div>' + '</div></section>';
        }).join('');
        return _rfStrip() + (slides.length ? '<section class="jg-slider"><div class="jg-slides" id="jgSlides" onscroll="VIP.lobby.jgSlideScroll(this)">' + slides.map((b) => '<div class="jg-slide"><img src="' + esc(b.img) + '" alt="" decoding="async" style="object-fit:' + (b.fit === 'contain' ? 'contain' : 'cover') + '"></div>').join('') + '</div>' +
                '<div class="jg-dots" id="jgDots">' + slides.map((_, i) => '<i class="' + (i ? '' : 'on') + '"></i>').join('') + '</div></section>' : '') +
            '<div class="jg-wrap"><div class="jg-searchrow"><label class="jg-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="M20 20l-4-4" stroke="currentColor" stroke-width="2"/></svg><input type="search" placeholder="Buscar juegos" value="' + esc(_q) + '" oninput="VIP.lobby.search(this.value)"></label>' +
            '<button type="button" class="jg-provbtn" onclick="VIP.lobby.jgProv(true)"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1" fill="currentColor"/><rect x="14" y="3" width="7" height="7" rx="1" fill="currentColor"/><rect x="3" y="14" width="7" height="7" rx="1" fill="currentColor"/><rect x="14" y="14" width="7" height="7" rx="1" fill="currentColor"/></svg>Proveedores</button></div>' + _jgCatnav('inicio') + '<div id="prlRes"></div>' + '<div id="jgExtra">' + _jgExtraHtml() + '</div>' + // #948: Juegos nuevos (lo de Girox que no está)
            '<section class="jg-sec">' + t('Eventos deportivos') + '<div id="jgBoard">' + _jgBoardHtml() + '</div></section>' + // #956: las casas de deportes (Digitain, Ultim8, Caballos…) están en el menú ☰, como en su página
            // #941: sin "Casino lobby" (su inicio no lo tiene)
            cols +
            ((d.live || []).length ? '<section class="jg-sec">' + t('Casino en Vivo') + '<div class="jg-live">' + d.live.map((l) => '<button type="button" onclick="VIP.lobby.go(\'vivo\')" aria-label="' + esc(l.label) + '"><img src="' + esc(l.img) + '" alt="' + esc(l.label) + '" loading="lazy"></button>').join('') + '</div></section>' : '') +
            ((d.covers || []).length ? '<div class="jg-covers">' + d.covers.map((c) => '<button type="button" class="jg-cover" onclick="VIP.lobby.go(\'' + esc(c.view) + '\')"><img src="' + esc(c.img) + '" alt="" loading="lazy"><span>' + esc(c.label) + '</span></button>').join('') + '</div>' : '') +
            '</div>' + _jgFooter() +
            '<div class="jg-provsheet" id="jgProv" hidden onclick="if(event.target===this)VIP.lobby.jgProv(false)"><div class="jg-provmodal"><div class="jg-provtop"><button type="button" onclick="VIP.lobby.jgProv(false)">CERRAR</button></div><div class="jg-provlist" id="jgProvList">' +
            _jgProvListHtml() + '</div></div></div>'; // #937: sus proveedores, en su orden y con su logo
    }
    // #940 (owner: "como jugaygana44, los partidos en Eventos deportivos"): "Top en vivo" y "Los más jugados" con partidos reales
    // (/api/sports/board, ESPN). Tocar un partido abre la casa de deportes de Girox (Digitain) logueada: no hay enlace directo a cada partido.
    let _jgBoard = null, _jgBoardAt = 0;
    function _jgMatch(m) {
        const o = m.odds;
        const team = (n, l, sc) => '<div class="jgm-t">' + (l ? '<img src="' + esc(l) + '" alt="" loading="lazy" onerror="this.remove()">' : '<i></i>') + '<span>' + esc(n) + '</span>' + (m.live ? '<b>' + esc(sc) + '</b>' : '') + '</div>';
        return '<button type="button" class="jgm" onclick="VIP.lobby.sport(\'/sports-new\')">' +
            '<div class="jgm-h"><span>' + esc(m.league) + '</span>' + (m.live ? '<em class="jgm-live">● ' + esc(m.clock || 'En vivo') + '</em>' : '<em>' + (m.today ? 'Hoy' : 'Mañana') + ' ' + esc(m.hour) + '</em>') + '</div>' +
            team(m.home, m.homeLogo, m.hs) + team(m.away, m.awayLogo, m.as) +
            (o ? '<div class="jgm-o"><span><small>1</small>' + o.home.toFixed(2) + '</span>' + (o.draw ? '<span><small>X</small>' + o.draw.toFixed(2) + '</span>' : '') + '<span><small>2</small>' + o.away.toFixed(2) + '</span></div>' : '<div class="jgm-o jgm-o-go"><span>Apostar ›</span></div>') +
            '</button>';
    }
    function _jgBoardHtml() {
        if (!_jgBoard || Date.now() - _jgBoardAt > 60000) _jgBoardLoad();
        if (!_jgBoard) return '<div class="jgm-sk"></div>';
        const row = (title, list, live) => list.length ? '<div class="jgm-sec"><h3>' + esc(title) + (live ? ' <span class="jgm-badge">live</span>' : '') + '</h3><div class="jgm-row">' + list.map(_jgMatch).join('') + '</div></div>' : '';
        return row('Top en vivo', _jgBoard.live || [], true) + row('Los más jugados', _jgBoard.top || [], false) +
            ((_jgBoard.live || []).length || (_jgBoard.top || []).length ? '<p class="jgm-note">Cuotas de referencia: en la casa de deportes pueden variar.</p>' : '');
    }
    function _jgBoardLoad() {
        if (_jgBoardLoad._busy) return; _jgBoardLoad._busy = true;
        fetch(VIP.config.API_URL + '/api/sports/board').then((r) => (r.ok ? r.json() : null)).catch(() => null).then((d) => {
            _jgBoardLoad._busy = false; if (!d) return;
            _jgBoard = d; _jgBoardAt = Date.now(); const b = $('jgBoard'); if (b && b.isConnected) b.innerHTML = _jgBoardHtml();
        });
    }
    function jgSlideScroll(el) { const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth)); _jgSlide = i; const d = $('jgDots'); if (d) [...d.children].forEach((b, k) => b.classList.toggle('on', k === i)); }
    function _jgAuto() {
        clearInterval(_jgTimer);
        _jgTimer = setInterval(() => { const el = $('jgSlides'); if (!el || !el.isConnected) { clearInterval(_jgTimer); return; } const n = el.children.length; if (!n) return; _jgSlide = (_jgSlide + 1) % n; try { el.scrollTo({ left: _jgSlide * el.clientWidth, behavior: 'smooth' }); } catch (_) { el.scrollLeft = _jgSlide * el.clientWidth; } }, 5000);
    }
    // #936 (owner: "en Mostrar Todo mostrá los juegos de cada sección, no de todos"): vista de UNA lista de juegos (sección del inicio, y desde
    // #937 cada proveedor y cada categoría de la barra copiados de jugaygana44), con la barra de categorías arriba.
    // #948 (owner: "arriba un listado de JUEGOS NUEVOS con todos los juegos de Girox que JUGAYGANA no tiene"; lo mismo en Ganamos): lista
    // /data/<marca>-extra.json ([key, nombre, portada, gid, lk, proveedor], del más nuevo al más viejo). Las portadas pasan por /api/games/img.
    const _xtra = {}, _xtraP = {};
    function _extraLoad(brand) {
        if (!_xtraP[brand]) _xtraP[brand] = fetch('/data/' + brand + '-extra.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
            .then((d) => { _xtra[brand] = ((d && d.games) || []).map((a) => ({ key: a[0], name: a[1], img: a[2], gid: a[3], lk: a[4] })); return _xtra[brand]; });
        return _xtraP[brand];
    }
    function _jgExtraHtml() {
        if (!_xtra.jugaygana) { _extraLoad('jugaygana').then(() => { const b = $('jgExtra'); if (b && b.isConnected) b.innerHTML = _jgExtraHtml(); }); return ''; }
        const g = _xtra.jugaygana.slice(0, 30); if (!g.length) return '';
        return '<section class="jg-sec"><div class="jg-sec-h"><div><h2 class="jg-st">Juegos nuevos</h2><span class="jg-line"></span></div><button type="button" class="jg-all" onclick="VIP.lobby.extraAll(\'jugaygana\')">TODOS</button></div>' +
            '<div class="jg-rows"><div class="jg-rowwrap"><button type="button" class="jg-arr jg-arr-l" onclick="VIP.lobby.jgArrow(this,-1)" aria-label="Anteriores">‹</button><div class="jg-row jg-row-g" style="--jr:2">' + g.map(_jgCard).join('') + '</div><button type="button" class="jg-arr jg-arr-r" onclick="VIP.lobby.jgArrow(this,1)" aria-label="Siguientes">››</button></div></div></section>';
    }
    // F971 (owner: "en proveedores de casino en vivo aparece 1 solo, meté todos los que haya, en todos lados"): la lista pública de proveedores
    // de 1girox sólo trae a Evolution; las mesas de Ezugi, Pragmatic Live, SA Gaming, Iconic21, Vivo Gaming, LiveVegas, TVBet y ElCasino están en
    // el catálogo pero sin proveedor listado. Van en /data/girox-live.json (scripts/girox/build-live.py), igual en las 4 páginas.
    let _live = null, _liveP = null;
    function _liveLoad() {
        if (!_liveP) _liveP = fetch('/data/girox-live.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
            .then((d) => { _live = ((d && d.providers) || []).map((p) => ({ name: String(p.name), games: (p.games || []).map((a) => ({ key: a[0], name: a[1], img: a[2], gid: a[3], lk: a[4] })) })); return _live; });
        return _liveP;
    }
    function _liveOr(fn) { if (_live) return true; _liveLoad().then(() => { if (_view === 'vivo' || _view === 'inicio') _render(); }); fn && fn(); return false; }
    function liveProv(i) { _liveLoad().then((L) => { const p = (L || [])[i]; if (p) jgList(p.name + ' · en vivo', p.games); }); }
    function _liveTiles() { return (_live || []).map((p, i) => ({ id: 0, name: p.name, count: p.games.length, live: true, on: 'VIP.lobby.liveProv(' + i + ')' })); }
    function _liveSecs(icon) { return (_live || []).map((p, i) => _row(icon || 'live', p.name, p.games.slice(0, 24), null, 'VIP.lobby.liveProv(' + i + ')')).join(''); }
    function extraAll(brand) { _extraLoad(brand).then((L) => jgList('Juegos nuevos', L || [])); }
    let _jgList = null;
    function jgList(title, games, cat) { _jgList = { title: String(title || ''), games: games || [], cat: cat || '' }; _allProv = null; _allCat = null; _view = 'jglist'; _render(); const m = $('prlMain'); if (m) m.scrollTop = 0; }
    function gnRow(i) { const r = ((_gnHomeData && _gnHomeData.rows) || [])[i]; if (r) jgList(r.title, r.games); } // #938
    // #948: las listas largas (miles de juegos) se muestran de a 120 para no trabar el teléfono.
    function _listMoreBtn(L) { L._n = 120; return L.games.length > 120 ? '<div class="prl-more"><button type="button" id="jgListMore" onclick="VIP.lobby.listMore()">Ver más (' + (L.games.length - 120) + ')</button></div>' : ''; }
    function listMore() {
        const L = _jgList; const box = $('jgListGrid'); if (!L || !box) return;
        const next = L.games.slice(L._n, L._n + 120); L._n += next.length;
        box.insertAdjacentHTML('beforeend', next.map(SK().layout === 'jugaygana' ? _jgCard : SK().layout === 'ganamos' ? _gnCard : SK().layout === 'buffaloplay' ? _bpCard : _card).join(''));
        const b = $('jgListMore'); if (b) { if (L._n >= L.games.length) b.parentNode.remove(); else b.textContent = 'Ver más (' + (L.games.length - L._n) + ')'; }
    }
    function jgColl(i) { const c = ((_jgHomeData && _jgHomeData.collections) || [])[i]; if (c) jgList(c.title, c.games); }
    function _jgListHtml() {
        const L = _jgList || { title: '', games: [] };
        if (SK().layout !== 'jugaygana') { // #938: Ganamos / PICA ROJA — la misma lista con sus tarjetas
            return _backBar() + '<div class="prl-sh"><span class="prl-st">' + ico('slots') + '<h3>' + esc(L.title) + '</h3></span></div>' +
                (L.games.length ? '<div class="' + (SK().layout === 'ganamos' ? 'gn-grid6' : 'prl-grid') + '" id="jgListGrid">' + L.games.slice(0, 120).map(SK().layout === 'ganamos' ? _gnCard : _card).join('') + '</div>' + _listMoreBtn(L) : '<div class="prl-note">Pronto vas a ver los juegos acá.</div>');
        }
        return _backBar() + '<div class="jg-wrap">' + _jgCatnav(L.cat) + '<div class="jg-sec-h jg-cat-h"><div><h2 class="jg-st">' + esc(L.title) + '</h2><span class="jg-line"></span></div></div></div>' +
            (L.games.length ? '<div class="prl-grid jg-grid" id="jgListGrid">' + L.games.slice(0, 120).map(_jgCard).join('') + '</div>' + _listMoreBtn(L) : '<div class="prl-note">Pronto vas a ver los juegos acá.</div>');
    }
    function jgProv(show) { const s2 = $('jgProv'); if (s2) s2.hidden = !show; }
    // ===== #958 BuffaloPlay (owner: "con el formato de Thornet, 100 % idéntica, con el logo de BuffaloPlay y los juegos de Girox"): página propia
    // de la misma cuenta. Inicio como thornet: carrusel · "Nuestra seleccion Pragmatic Live Casino" · Deportivas · "Recomendados de RedRake" ·
    // "Mesas en vivo seleccionadas" · redes · pie (Productos / Nosotros / Promociones). Slots: Favoritos · Recientes · buscador · pestañas de
    // proveedores en su orden (sólo los juegos que Girox tiene, con SUS portadas) + "Nuevos" (lo de Girox que su página no tiene). Casino en vivo:
    // Pragmatic Play / Ezugi / Vivo Gaming. Datos: /data/buffaloplay-home.json, -games.json y -extra.json. Favoritos y recientes = en el teléfono.
    let _bpHome = null, _bpHomeP = null, _bpGames = null, _bpGamesP = null, _bpTab = 0, _bpQ = '', _bpQTimer = null, _bpSlide = 0, _bpTimer = null, _bpTabsOpen = false, _bpCur = null;
    const _bpIdx = {};
    const _bpA = (a) => ({ key: a[0], name: a[1], img: a[2], gid: a[3], lk: a[4] });
    function _bpLoad() {
        if (!_bpHomeP) _bpHomeP = fetch('/data/buffaloplay-home.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => null).then((d) => { _bpHome = d || {}; return _bpHome; });
        if (!_bpGamesP) _bpGamesP = fetch('/data/buffaloplay-games.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => null).then((d) => { _bpGames = d || { providers: [] }; return _bpGames; });
        return Promise.all([_bpHomeP, _bpGamesP, _extraLoad('buffaloplay')]);
    }
    const _bpLS = (k) => { try { const v = JSON.parse(localStorage.getItem(k) || '[]'); return Array.isArray(v) ? v : []; } catch (_) { return []; } };
    const _bpSave = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} };
    const _bpG2A = (g) => [g.key, g.name, g.img || '', g.gid || 0, g.lk || ''];
    const _bpPlayAttrs = (g) => ' onclick="VIP.lobby.play(\'' + esc(g.key) + '\', this)" data-name="' + esc(g.name) + '"' + (g.gid ? ' data-gid="' + Number(g.gid) + '" data-lk="' + esc(g.lk || '') + '"' : '') + ' aria-label="' + esc(g.name) + '"';
    const BP_HEART = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7.6-4.7-9.6-9.3C1 7.9 3.1 4.4 6.6 4.4c2.2 0 3.7 1.2 4.4 2.5.7-1.3 2.2-2.5 4.4-2.5 3.5 0 5.6 3.5 4.2 6.8-2 4.6-9.6 9.3-9.6 9.3z"/></svg>';
    function _bpCard(g) { // como su tarjeta: la portada entera, sin texto encima, y el corazón arriba a la derecha
        _bpIdx[g.key] = g; const on = _bpLS('vip_bp_favs').some((f) => f[0] === g.key);
        return '<div class="bp-g"><button type="button" class="bp-gp"' + _bpPlayAttrs(g) + '><i>' + esc(g.name) + '</i>' + (g.img ? '<img loading="lazy" decoding="async" src="' + esc(img(g.img)) + '" alt="" onerror="this.remove()">' : '') + '</button>' +
            '<button type="button" class="bp-fav' + (on ? ' on' : '') + '" data-k="' + esc(g.key) + '" onclick="VIP.lobby.bpFav(\'' + esc(g.key) + '\')" aria-label="Favorito">' + BP_HEART + '</button></div>';
    }
    function bpFav(key) {
        const g = _bpIdx[key]; if (!g) return;
        let f = _bpLS('vip_bp_favs'); const on = f.some((x) => x[0] === key);
        f = on ? f.filter((x) => x[0] !== key) : [_bpG2A(g)].concat(f).slice(0, 200); _bpSave('vip_bp_favs', f);
        document.querySelectorAll('.bp-fav[data-k="' + key.replace(/["\\]/g, '') + '"]').forEach((b) => b.classList.toggle('on', !on));
        if (_bpTab === 'fav' && !_bpQ) _bpFill();
    }
    function _bpRecent(key) {
        const g = _bpIdx[key]; if (!g) return;
        _bpSave('vip_bp_rec', [_bpG2A(g)].concat(_bpLS('vip_bp_rec').filter((x) => x[0] !== key)).slice(0, 40));
    }
    // ---- Inicio
    function _bpSportsBtn(t) { return '<button type="button" onclick="VIP.lobby.sportsMenu(event)">' + t + '</button>'; }
    function _bpFooter() {
        const l = (t, on) => '<button type="button" onclick="' + on + '">' + esc(t) + '</button>';
        const horses = ((_data && _data.sports) || []).find((x) => /horse|caballo/i.test((x.key || '') + ' ' + (x.path || '') + ' ' + (x.title || '')));
        return '<div class="bp-social" role="button" onclick="VIP.stories.open()"><b>Seguinos en nuestras redes sociales!</b><div class="bp-soc">' +
            ['<path d="M14 8h3V4h-3c-2.8 0-4 1.8-4 4.3V10H7v4h3v8h4v-8h3l1-4h-4V8.6c0-.4.3-.6.6-.6z"/>', '<rect x="4" y="4" width="16" height="16" rx="4.5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3.6" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="17" cy="7" r="1.2"/>',
             '<path d="M5 9h3v11H5zM6.5 4a1.8 1.8 0 1 1 0 3.6 1.8 1.8 0 0 1 0-3.6zM10 9h3v1.6c.5-1 1.8-1.9 3.6-1.9 3 0 3.4 2 3.4 4.6V20h-3v-5.8c0-1.4 0-3-1.9-3s-2.1 1.4-2.1 2.9V20h-3z"/>', '<path d="M21 6.5c-.7.3-1.4.5-2.1.6.8-.5 1.3-1.2 1.6-2-.7.4-1.5.7-2.3.9a3.6 3.6 0 0 0-6.2 3.3C8.9 9.1 6.2 7.7 4.5 5.5c-1 1.7-.5 3.8 1.1 4.8-.6 0-1.1-.2-1.6-.4 0 1.7 1.2 3.2 2.9 3.6-.5.1-1.1.2-1.6.1.5 1.4 1.8 2.5 3.4 2.5A7.3 7.3 0 0 1 3.5 17.6 10.3 10.3 0 0 0 9.1 19c6.7 0 10.5-5.6 10.3-10.7.7-.5 1.3-1.1 1.6-1.8z"/>']
                .map((p) => '<svg viewBox="0 0 24 24" aria-hidden="true">' + p + '</svg>').join('') + '</div></div>' +
            '<footer class="bp-foot"><p class="bp-copy">© BuffaloPlay</p>' +
            '<div class="bp-fc"><h4>PRODUCTOS</h4>' + _bpSportsBtn('Deportes') + l('Slots', "VIP.lobby.go('slots')") + l('Casino Vivo', "VIP.lobby.go('vivo')") +
                (horses ? l('Caballos', "VIP.lobby.sport('" + esc(horses.path) + "')") : '') + l('CrazZy Win!', "VIP.lobby.go('crazy')") + '</div>' +
            '<div class="bp-fc"><h4>NOSOTROS</h4>' + l('Terminos y Condiciones', 'VIP.home.casinoInfo()') + l('Politica de Privacidad', 'VIP.home.casinoInfo()') + l('Juego Responsable', 'VIP.home.casinoInfo()') + '</div>' +
            '<div class="bp-fc"><h4>PROMOCIONES</h4>' + l('Sorteo del mes', "VIP.sorteos.open('mensual')") + l('Juegos nuevos', "VIP.lobby.bpOpenTab('new')") + '</div>' +
            '<div class="bp-resp"><span class="bp-18">18+</span> Jugá responsablemente. Si necesitás ayuda escribinos por <button type="button" onclick="VIP.lobby.support()">Soporte</button>.</div></footer>';
    }
    function _bpHomeHtml() {
        const d = _bpHome || {}; const sl = d.slides || [];
        const big = (a, cls) => { const g = _bpA(a); _bpIdx[g.key] = g; return '<button type="button" class="' + cls + '"' + _bpPlayAttrs(g) + '><img src="' + esc(img(g.img)) + '" alt="" loading="lazy" decoding="async"></button>'; };
        const rr = d.redrake || [];
        return _rfStrip() + '<section class="bp-slider"><div class="bp-slides" id="bpSlides" onscroll="VIP.lobby.bpSlideScroll(this)">' + sl.map((s) => '<div class="bp-slide"><img src="' + esc(s) + '" alt="" decoding="async"></div>').join('') + '</div>' +
                (sl.length > 1 ? '<button type="button" class="bp-sa bp-sa-l" onclick="VIP.lobby.bpSlideGo(-1)" aria-label="Anterior">‹</button><button type="button" class="bp-sa bp-sa-r" onclick="VIP.lobby.bpSlideGo(1)" aria-label="Siguiente">›</button>' +
                '<div class="bp-dots" id="bpDots">' + sl.map((_, i) => '<i class="' + (i ? '' : 'on') + '"></i>').join('') + '</div>' : '') + '</section>' +
            ((d.liveSel || []).length ? '<h2 class="bp-t bp-t0">Nuestra seleccion Pragmatic Live Casino</h2><div class="bp-lsel">' + d.liveSel.map((a) => big(a, 'bp-lc')).join('') + '</div>' : '') +
            '<h2 class="bp-t">Deportivas</h2><button type="button" class="bp-sport" onclick="VIP.lobby.sportsMenu(event)" aria-label="Deportes"><img src="' + SK().dir + 'deportivas.webp" alt="Las mejores ligas están aquí" loading="lazy"></button>' +
            (rr.length ? '<h2 class="bp-red">Recomendados de RedRake</h2><div class="bp-rr"><div class="bp-rrs" id="bpRr" onscroll="VIP.lobby.bpRrScroll(this)">' + rr.map((a) => big(a, 'bp-rc')).join('') + '</div>' +
                '<div class="bp-rrd" id="bpRrd">' + rr.map((_, i) => '<i class="' + (i ? '' : 'on') + '"></i>').join('') + '</div></div>' : '') +
            ((d.tables || []).length ? '<h2 class="bp-t">Mesas en vivo seleccionadas</h2><div class="bp-tables">' + d.tables.map((a) => big(a, 'bp-tc')).join('') + '</div>' : '') +
            _bpFooter();
    }
    function bpSlideScroll(el) { const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth)); _bpSlide = i; const d = $('bpDots'); if (d) [...d.children].forEach((b, k) => b.classList.toggle('on', k === i)); }
    function bpSlideGo(dir) { const el = $('bpSlides'); if (!el) return; const n = el.children.length; _bpSlide = (_bpSlide + dir + n) % n; try { el.scrollTo({ left: _bpSlide * el.clientWidth, behavior: 'smooth' }); } catch (_) { el.scrollLeft = _bpSlide * el.clientWidth; } }
    function _bpAuto() { clearInterval(_bpTimer); _bpTimer = setInterval(() => { const el = $('bpSlides'); if (!el || !el.isConnected) { clearInterval(_bpTimer); return; } bpSlideGo(1); }, 5000); }
    function bpRrScroll(el) {
        const c = el.children[0]; if (!c) return; const w = c.getBoundingClientRect().width + 14;
        const i = Math.round(el.scrollLeft / Math.max(1, w)); const d = $('bpRrd'); if (d) [...d.children].forEach((b, k) => b.classList.toggle('on', k === i));
    }
    // ---- Slots
    function _bpTabsList() { return [['new', 'Nuevos']].concat(((_bpGames && _bpGames.providers) || []).map((p, i) => [String(i), p.n])); }
    function _bpSlotsHtml() {
        const tb = (t) => '<button type="button" class="bp-tab' + (String(_bpTab) === t[0] && !_bpQ ? ' on' : '') + '" data-t="' + t[0] + '" onclick="VIP.lobby.bpTabGo(\'' + t[0] + '\')">' + esc(t[1]) + (t[0] === 'new' ? ' <em>' + ((_xtra.buffaloplay || []).length) + '</em>' : '') + '</button>';
        return '<div class="bp-bar"><div class="bp-sr">' +
                '<button type="button" class="bp-fr' + (_bpTab === 'fav' && !_bpQ ? ' on' : '') + '" data-t="fav" onclick="VIP.lobby.bpTabGo(\'fav\')">' + BP_HEART + '<span>Favoritos</span></button>' +
                '<button type="button" class="bp-fr' + (_bpTab === 'rec' && !_bpQ ? ' on' : '') + '" data-t="rec" onclick="VIP.lobby.bpTabGo(\'rec\')"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v4.5h-4.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Recientes</span></button>' +
                '<input type="search" class="bp-q" id="bpQ" value="' + esc(_bpQ) + '" placeholder="Buscar juego" autocomplete="off" oninput="VIP.lobby.bpSearch(this.value)" aria-label="Buscar juego">' +
                '<button type="button" class="bp-qb" onclick="VIP.lobby.bpSearch(document.getElementById(\'bpQ\').value, true)" aria-label="Buscar">' + ico('search') + '</button></div>' +
            '<div class="bp-tabs' + (_bpTabsOpen ? ' open' : '') + '" id="bpTabsBox"><div class="bp-tabs-s" id="bpTabs">' + _bpTabsList().map(tb).join('') + '</div>' +
                '<button type="button" class="bp-tabx" onclick="VIP.lobby.bpTabs()" aria-label="Ver todos los proveedores"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div></div>' +
            '<div class="bp-grid" id="bpGrid"></div><div class="bp-empty" id="bpEmpty" hidden></div><div class="prl-more" id="bpMore" hidden><button type="button" onclick="VIP.lobby.bpMore()">Ver más</button></div>';
    }
    const _bpNorm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
    function _bpListNow() {
        if (_bpQ.length >= 2) {
            const q = _bpNorm(_bpQ); const seen = {}; const out = [];
            const add = (g) => { if (!seen[g.key] && _bpNorm(g.name).indexOf(q) >= 0) { seen[g.key] = 1; out.push(g); } };
            ((_bpGames && _bpGames.providers) || []).forEach((p) => p.g.forEach((a) => add(_bpA(a)))); (_xtra.buffaloplay || []).forEach(add);
            return { games: out, empty: 'No encontramos "' + _bpQ + '".' };
        }
        if (_bpTab === 'fav') return { games: _bpLS('vip_bp_favs').map(_bpA), empty: 'Tocá el ♥ de un juego para tenerlo acá.' };
        if (_bpTab === 'rec') return { games: _bpLS('vip_bp_rec').map(_bpA), empty: 'Los juegos que abras van a aparecer acá.' };
        if (_bpTab === 'new') return { games: _xtra.buffaloplay || [], empty: 'Pronto vas a ver los juegos nuevos acá.' };
        const p = ((_bpGames && _bpGames.providers) || [])[Number(_bpTab)] || ((_bpGames && _bpGames.providers) || [])[0];
        return { games: p ? p.g.map(_bpA) : [], empty: 'Pronto vas a ver los juegos acá.' };
    }
    function _bpFill() {
        const box = $('bpGrid'); if (!box) return;
        const L = _bpListNow(); _bpCur = { games: L.games, n: 0 }; box.innerHTML = '';
        const e = $('bpEmpty'); if (e) { e.hidden = !!L.games.length; e.textContent = L.games.length ? '' : L.empty; }
        bpMore();
    }
    function bpMore() {
        const box = $('bpGrid'); const L = _bpCur; if (!box || !L) return;
        const next = L.games.slice(L.n, L.n + 90); L.n += next.length; box.insertAdjacentHTML('beforeend', next.map(_bpCard).join(''));
        const b = $('bpMore'); if (b) b.hidden = L.n >= L.games.length;
    }
    function _bpPaintTabs() {
        document.querySelectorAll('.bp-tab, .bp-fr').forEach((b) => b.classList.toggle('on', !_bpQ && b.dataset.t === String(_bpTab)));
        const on = document.querySelector('.bp-tab.on'); const s = $('bpTabs');
        if (on && s && !_bpTabsOpen) { try { s.scrollTo({ left: on.offsetLeft - (s.clientWidth - on.offsetWidth) / 2, behavior: 'smooth' }); } catch (_) {} }
    }
    function bpTabGo(t) {
        _bpTab = (t === 'fav' || t === 'rec' || t === 'new') ? t : Number(t); _bpQ = ''; _bpTabsOpen = false;
        const q = $('bpQ'); if (q) q.value = ''; const tb = $('bpTabsBox'); if (tb) tb.classList.remove('open');
        _bpPaintTabs(); _bpFill(); const m = $('prlMain'); if (m) m.scrollTop = 0;
    }
    function bpOpenTab(t) { bpNav(false); _bpTab = (t === 'fav' || t === 'rec' || t === 'new') ? t : Number(t) || 0; _bpQ = ''; go('slots'); }
    function bpTabs() { _bpTabsOpen = !_bpTabsOpen; const tb = $('bpTabsBox'); if (tb) tb.classList.toggle('open', _bpTabsOpen); }
    function bpSearch(v, now) {
        clearTimeout(_bpQTimer);
        _bpQTimer = setTimeout(() => { _bpQ = String(v || '').trim(); if (_bpQ.length === 1) return; _bpPaintTabs(); _bpFill(); }, now ? 0 : 250);
    }
    // ---- Casino en vivo y CrazZy Win!
    function _bpLiveHtml() {
        const L = (_bpHome && _bpHome.live) || [];
        // #959 (owner: "sacá los juegos de adentro, que entren a esos juegos"): cada tarjeta (foto de BuffaloPlay) abre DIRECTO el lobby de Girox.
        _liveOr();
        return '<div class="bp-lv">' + L.map((l) => { const g = _bpA(l.lobby || []); return '<button type="button"' + (g.key ? _bpPlayAttrs(g) : '') + '><img src="' + esc(l.img) + '" alt="' + esc(l.n) + '" loading="lazy"></button>'; }).join('') + '</div>' +
            (_live || []).map((p, i) => '<div class="bp-lt bp-lt-live"><h2>' + esc(p.name) + '</h2><button type="button" class="bp-lt-all" onclick="VIP.lobby.liveProv(' + i + ')">Ver todos (' + p.games.length + ')</button></div>' + // F971
                '<div class="bp-grid">' + p.games.slice(0, 12).map(_bpCard).join('') + '</div>').join('');
    }
    function _bpGridHtml(title, games, banner) {
        _bpCur = null;
        return '<div class="bp-lt"><button type="button" onclick="VIP.lobby.back()" aria-label="Volver">‹</button><h2>' + esc(title) + '</h2></div>' + (banner || '') +
            (games.length ? '<div class="bp-grid" id="jgListGrid">' + games.slice(0, 120).map(_bpCard).join('') + '</div>' : '<div class="bp-empty">Pronto vas a ver los juegos acá.</div>');
    }
    function _bpRender(m) {
        clearInterval(_bpTimer);
        if (!_bpHome || !_bpGames || !_xtra.buffaloplay) { m.innerHTML = '<div class="prl-note">Cargando…</div>'; _bpLoad().then(() => { if (_skin === 'buffaloplay') _render(); }); return; }
        if (_view === 'slots' || _view === 'all') { m.innerHTML = _bpSlotsHtml(); _bpFill(); setTimeout(_bpPaintTabs, 0); return; }
        if (_view === 'vivo') { m.innerHTML = _bpLiveHtml(); return; }
        if (_view === 'crazy') { m.innerHTML = '<img class="bp-cwb" src="' + SK().dir + 'crazywin.webp" alt="CrazZy Win!">' + '<div class="bp-grid bp-grid-cw">' + (_bpHome.crazy || []).map((a) => _bpCard(_bpA(a))).join('') + '</div>'; return; }
        if (_view === 'jglist') { const L = _jgList || { title: '', games: [] }; m.innerHTML = _bpGridHtml(L.title, L.games); if (L.games.length > 120) { L._n = 120; m.insertAdjacentHTML('beforeend', _listMoreBtn(L)); } return; }
        _view = 'inicio'; m.innerHTML = _bpHomeHtml(); _bpSlide = 0; _bpAuto();
    }
    // Menú ☰ de la izquierda (secciones, como su página); el ícono de usuario abre la cuenta (saldo, cargar/retirar, nivel, perfil).
    // #960 (owner, foto del menú de thornet abierto en el celu): sus íconos y sus 6 secciones, la actual resaltada, y un banner abajo (CrazZy Win!).
    function bpNav(show) {
        const n = $('bpNav'); if (!n) return;
        if (show) {
            const horses = ((_data && _data.sports) || []).find((x) => /horse|caballo/i.test((x.key || '') + ' ' + (x.path || '') + ' ' + (x.title || '')));
            const it = (ic, t, on, cur) => '<button type="button" class="' + (cur ? 'on' : '') + '" onclick="VIP.lobby.bpNav(false);' + on + '"><img src="' + SK().dir + 'nav/' + ic + '.png" alt="">' + esc(t) + '</button>';
            n.querySelector('.bp-nav').innerHTML = '<div class="bp-nav-l">' +
                it('inicio', 'Inicio', "VIP.lobby.go('inicio')", _view === 'inicio') + it('deportes', 'Deportes', 'VIP.lobby.sportsMenu(null)', false) +
                it('slots', 'Slots', "VIP.lobby.go('slots')", _view === 'slots') + it('vivo', 'Casino Vivo', "VIP.lobby.go('vivo')", _view === 'vivo') +
                (horses ? it('caballos', 'Caballos', "VIP.lobby.sport('" + esc(horses.path) + "')", false) : '') + it('crazy', 'CrazZy Win!', "VIP.lobby.go('crazy')", _view === 'crazy') + '</div>' +
                '<button type="button" class="bp-nav-b" onclick="VIP.lobby.bpNav(false);VIP.lobby.go(\'crazy\')" aria-label="CrazZy Win!"><img src="' + SK().dir + 'crazywin.webp" alt=""></button>';
        }
        n.hidden = !show;
    }
    function bpRefresh(btn) {
        try { btn.classList.add('spin'); setTimeout(() => btn.classList.remove('spin'), 900); } catch (_) {}
        try { if (VIP.ui && VIP.ui.syncBalance) Promise.resolve(VIP.ui.syncBalance()).then(_paintBal, _paintBal); } catch (_) {}
        setTimeout(_paintBal, 1200);
    }
    function _render() {
        const m = $('prlMain'); if (!m) return; _secN = 0;
        if (SK().layout === 'buffaloplay') { _bpRender(m); return; } // #958
        document.querySelectorAll('.prl-nav [data-v], .gnm__main [data-v]').forEach((b) => b.classList.toggle('on', b.dataset.v === _view || (_view === 'all' && b.dataset.v === 'slots')));
        if (_view === 'sorteos') { _view = 'inicio'; try { VIP.sorteos.open('mensual'); } catch (_) {} } // #917: la pestaña Sorteos abre el sorteo mensual
        if (!_data) { m.innerHTML = (SK().layout === 'ganamos' ? _gnPromos(false) : _hero()) + '<div class="prl-note">Cargando los juegos…</div>'; return; }
        if (SK().layout === 'ganamos' && _view === 'inicio') { _gcN = 0; m.innerHTML = _gnHome(); _gnFillRows(); return; }
        if (SK().layout === 'jugaygana' && _view === 'inicio') {
            if (!_jgHomeData) { m.innerHTML = '<div class="prl-note">Cargando…</div>'; _jgData().then(() => { if (_skin === 'jugaygana' && _view === 'inicio') _render(); }); return; }
            m.innerHTML = _jgHome(); _jgSlide = 0; _jgAuto(); if (_q) search(_q); return;
        }
        if (_view === 'jglist') { if (SK().layout === 'jugaygana' && !_jgHomeData) { _jgData().then(() => _render()); } m.innerHTML = _jgListHtml(); return; } // #936/#938
        if (_view === 'lobbies') { m.innerHTML = _backBar() + (_lobbies().length ? (SK().layout === 'ganamos' ? _gcar('Casino lobby', _lobbies(), null) : _row('grid', 'Casino lobby', _lobbies())) : '<div class="prl-note">No hay lobbies para mostrar ahora.</div>'); return; }
        if (_view === 'deportes') {
            m.innerHTML = _backBar() + _title('sport', 'Deportes', null) + '<div class="prl-sports">' + (_data.sports || []).map((s, i) => '<button type="button" class="prl-sport" onclick="VIP.lobby.sport(\'' + esc(s.path) + '\')"><img src="' + (SK().layout === 'ganamos' ? SK().dir + 'casino-bg.png' : SK().layout === 'jugaygana' ? '/images/jugaygana/io/sports_cover_m.webp' : SK().dir + 'b3.svg') + '" alt="" class="prl-sport-bg' + (i ? ' alt' : '') + '"><span><b>' + esc(s.title) + '</b><small>' + esc(s.sub) + '</small></span></button>').join('') + '</div><p class="prl-note">Entrás con tu misma cuenta y tu saldo.</p>';
            return;
        }
        if (_view === 'vivo') {
            if (!_liveOr()) { m.innerHTML = _backBar() + _title('live', 'Casino en vivo', null) + '<div class="prl-note">Cargando…</div>'; return; }
            m.innerHTML = _backBar() + _title('live', 'Casino en vivo', null) + _providers(_liveTiles(), true) + // F971: todos los proveedores en vivo
                (_liveSecs() || (_data.live || []).map((s) => _row('live', s.title, s.games, s.providerId)).join('') || '<div class="prl-note">No hay mesas en vivo para mostrar ahora.</div>');
            return;
        }
        if (_view === 'slots' && SK().layout === 'ganamos') { m.innerHTML = _gnCasinoHtml(); return; } // #949
        if (_view === 'slots' || _view === 'all') {
            if (_view === 'slots' || _allProv) _allCat = null;
            if (_allCat && SK().layout === 'jugaygana') { // #918: categoría de la barra de JUGAYGANA (su barra sigue arriba)
                m.innerHTML = _backBar() + '<div class="jg-wrap">' + _jgCatnav(_allCat.key) + '<div class="jg-sec-h jg-cat-h"><div><h2 class="jg-st">' + esc(_allCat.label) + '</h2><span class="jg-line"></span></div></div></div><div class="prl-grid jg-grid" id="prlAll"></div><div class="prl-note" id="prlAllMore">Cargando…</div>';
                _allPage = 0; _allMore = true; _moreAll(); return;
            }
            const t = _allProv ? _allProv.name : 'Slots · todos los juegos';
            m.innerHTML = _backBar() + '<div class="prl-sh"><span class="prl-st">' + ico('slots') + '<h3>' + esc(t) + '</h3></span>' + (_allProv ? '<button type="button" class="prl-back" onclick="VIP.lobby.all(null)">Ver todos</button>' : '') + '</div>' +
                (_allProv ? '' : _search()) + '<div class="prl-grid" id="prlAll"></div><div class="prl-note" id="prlAllMore">Cargando…</div>';
            _allPage = 0; _allMore = true; _moreAll(); if (_q && !_allProv) search(_q); return;
        }
        _liveOr();
        const _pvAll = (_data.providers || []).concat(_liveTiles().filter((t) => !(_data.providers || []).some((p) => String(p.name).toLowerCase() === t.name.toLowerCase()))); // F971
        m.innerHTML = _rfStrip() + _hero() + _providers(_pvAll, true) + _row('grid', 'Casino lobby', _lobbies()) + _search() + // #925: Proveedores arriba, sin "Ver más (60)"
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
        if (SK().layout === 'buffaloplay') { if (_view === 'slots' && _bpCur && m.scrollTop + m.clientHeight > m.scrollHeight - 700) bpMore(); return; } // #958
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
    let _qlDragged = false;
    function ql() { if (_qlDragged) return; try { VIP.home.toggleCasinoLoad(); } catch (_) {} }
    function _dragQl() { // #920 (owner): la burbuja se mueve como la de Girox; queda donde la dejás (posición recordada)
        const b = $('prlQl'); if (!b || b._drag || !window.PointerEvent) return; b._drag = true; b.style.touchAction = 'none';
        try { const pos = JSON.parse(localStorage.getItem('vip_prl_ql_pos') || 'null'); if (pos && pos.left >= 0 && pos.top >= 0 && pos.left < window.innerWidth - 60 && pos.top < window.innerHeight - 40) { b.style.left = pos.left + 'px'; b.style.top = pos.top + 'px'; b.style.right = 'auto'; b.style.bottom = 'auto'; } } catch (_) {}
        let sx = 0, sy = 0, r0 = null, dr = false;
        b.addEventListener('pointerdown', (e) => { sx = e.clientX; sy = e.clientY; r0 = b.getBoundingClientRect(); dr = false; try { b.setPointerCapture(e.pointerId); } catch (_) {} });
        b.addEventListener('pointermove', (e) => {
            if (!r0) return; const dx = e.clientX - sx, dy = e.clientY - sy; if (!dr && Math.abs(dx) + Math.abs(dy) < 8) return; dr = true;
            const host = b.offsetParent ? b.offsetParent.getBoundingClientRect() : { left: 0, top: 0 };
            b.style.left = Math.min(Math.max(4, r0.left + dx), window.innerWidth - r0.width - 4) - host.left + 'px'; b.style.top = Math.min(Math.max(10, r0.top + dy), window.innerHeight - r0.height - 10) - host.top + 'px'; b.style.right = 'auto'; b.style.bottom = 'auto';
        });
        const end = () => { if (r0 && dr) { try { localStorage.setItem('vip_prl_ql_pos', JSON.stringify({ left: parseInt(b.style.left, 10), top: parseInt(b.style.top, 10) })); } catch (_) {} _qlDragged = true; setTimeout(() => { _qlDragged = false; }, 400); } r0 = null; dr = false; };
        b.addEventListener('pointerup', end); b.addEventListener('pointercancel', end);
    }
    // F979: dominio propio de cada marca (panel → Configuración → Dominios de las marcas). Vacío ⇒ la página se abre acá adentro como siempre.
    // Cargado y estamos en OTRO dominio ⇒ se pide un link de acceso de un solo uso y se pasa a ese dominio ya logueado (misma cuenta y saldo).
    let _domains = null, _domainGo = false;
    try { fetch('/api/brand-domains').then((r) => (r.ok ? r.json() : null)).then((d) => { _domains = (d && d.domains) || {}; }).catch(() => {}); } catch (_) {}
    function _toDomain(brand, view) {
        const host = _domains && _domains[brand]; if (!host || _domainGo || location.hostname === host) return false;
        if (!(VIP.state && VIP.state.currentToken)) return false;
        _domainGo = true; try { VIP.ui.showToast('Abriendo ' + (SKINS[brand] ? SKINS[brand].name : '') + '…', 'info'); } catch (_) {}
        fetch(VIP.config.API_URL + '/api/auth/brand-link', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + VIP.state.currentToken }, body: JSON.stringify({ brand }) })
            .then((r) => r.json().then((j) => ({ ok: r.ok, j }))).then(({ ok, j }) => { if (ok && j && /^https:\/\//.test(j.url || '')) { location.href = j.url; return; } throw new Error('sin link'); })
            .catch(() => { _domains[brand] = ''; _domainGo = false; open(view, brand); }); // si falla, se abre acá como siempre
        return true;
    }
    function open(view, skin) {
        try { if (_toDomain(SKINS[skin] ? skin : 'picaroja', view)) return; } catch (_) {} // F979
        // #969 (owner: "si eligió una, sólo puede entrar en esa hasta tener saldo 0"): si el server dice que la marca activa es OTRA, se pasa por
        // openPlatform (chequea el saldo y, si está bloqueada, muestra el cartel). En el sitio JUGAYGANA no hay otra página: se abre igual.
        try { const act = VIP.home.brandActive && VIP.home.brandActive(); const want = SKINS[skin] ? skin : 'picaroja';
            if (act && act !== want && window.VIP_SITE !== 'jugaygana') { VIP.home.openPlatform(want); return; } } catch (_) {}
        _skin = SKINS[skin] ? skin : 'picaroja';
        const el = _shell(); el.hidden = false; document.body.classList.add('prl-open', 'casino-open'); try { document.documentElement.classList.add('jyg-ready'); } catch (_) {} // #944: saca la pantalla de carga // #914: modales (Perfil, Info, Retiro…) arriba de la página
        _view = view || 'inicio'; _render(); _paintBal(); try { VIP.stories.paint(); } catch (_) {} // #931: aro y contador de historias en la barra // #919: cuenta regresiva del sorteo al toque
        clearInterval(_balTimer); _balTimer = setInterval(_paintBal, 5000);
        const m = $('prlMain'); if (m && !m._prlScroll) { m._prlScroll = true; m.addEventListener('scroll', _onScroll, { passive: true }); }
        if (!_data) _load();
        try { _dragQl(); } catch (_) {}
<<<<<<< ours
        if (_skin === 'jugaygana') setTimeout(() => { try { const lb = $('prLobby'); if (lb && !lb.hidden && _skin === 'jugaygana') VIP.home.toggleCasinoLoad(true); } catch (_) {} }, 700); // F982
=======
        // F982/F984: JUGAYGANA y Ganamos abren con la Carga rápida desplegada; cerrada, queda el botón CARGA RÁPIDA de arriba
        if (_skin === 'jugaygana' || _skin === 'ganamos') { const sk0 = _skin; setTimeout(() => { try { const lb = $('prLobby'); if (lb && !lb.hidden && _skin === sk0) VIP.home.toggleCasinoLoad(true); } catch (_) {} }, 700); }
>>>>>>> theirs
        try { if ($('prlQl') && !sessionStorage.getItem('vip_ql_tip')) { sessionStorage.setItem('vip_ql_tip', '1'); VIP.ui.showToast('💡 La burbuja de Carga rápida se puede mover: mantenela apretada y arrastrala si te tapa algo.', 'info'); } } catch (_) {} // #920 (#944: una vez por sesión)
    }
    // #944: en el sitio JUGAYGANA la página NO se cierra (no hay otra app detrás): "Volver" lleva a su inicio. close(true) la cierra igual.
    function close(force) {
        if (window.VIP_SITE === 'jugaygana' && force !== true && _skin === 'jugaygana') { menu(false); go('inicio'); return; }
        const el = $('prLobby'); if (el) el.hidden = true; document.body.classList.remove('prl-open'); clearInterval(_balTimer); clearInterval(_jgTimer); clearInterval(_bpTimer);
        try { if (!(VIP.ui && VIP.ui._casinoOpen)) document.body.classList.remove('casino-open'); const p = $('casinoLoadPanel'); if (p && el && el.contains(p)) p.style.display = 'none'; if (VIP.home.casinoQuickClose && el && el.contains(p)) VIP.home.casinoQuickClose(); } catch (_) {}
    }
    function go(view) { if (view === 'deportes') { sportsMenu(null); return; } if (view === 'slots') _allProv = null; if (view !== 'all') _allCat = null; _view = view; _render(); const m = $('prlMain'); if (m) m.scrollTop = 0; }
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
        const ds = (btn && btn.dataset) || {}; // #944: id interno + launcher (si la tarjeta los tiene)
        if (_skin === 'buffaloplay') _bpRecent(key); // #958: "Recientes" de BuffaloPlay
        if (VIP.home && VIP.home.gamePlay) VIP.home.gamePlay(key, name, ds.gid ? { gid: Number(ds.gid), lk: ds.lk || '' } : null);
    }
    // #962 (owner: "deportes que entre directo al link, sin pasar por Girox; ninguna visual de Girox en las otras páginas"): cada casa se abre con
    // SU link directo (el mismo ingreso que los favoritos: /api/platform/session ⇒ URL del proveedor), aunque la lista del server no haya llegado.
    // Si 1girox no da el link, favPlay avisa y se reintenta: nunca se cae en la web de Girox.
    const SPORT_KEYS = { '/sports-new': ['sport/onyx', 'Digitain'], '/sports': ['sport/gr8', 'Ultim8'], '/horses': ['sport/horses', 'Caballos'], '/horses-new': ['sport/turf', 'TurfWin'], '/poker': ['sport/poker', 'Póker'] };
    function sport(path) {
        const sp = ((_data && _data.sports) || []).find((x) => x.path === path || x.key === path);
        const k = (sp && sp.key) ? [sp.key, sp.title] : (SPORT_KEYS[path] || (/^sport\//.test(path) ? [path, 'Deportes'] : SPORT_KEYS['/sports-new']));
        try { VIP.home.gamePlay(k[0], k[1]); } catch (_) {}
    }
    // #909 (owner): MENÚ con el perfil: saldo, nivel y rango (VIP), y Soporte adentro (salió de la barra de abajo).
    async function menu(show) {
        const dr = $('prlDrawer'); if (!dr) return;
        if (show === false || (show == null && !dr.hidden)) { dr.hidden = true; return; }
        dr.hidden = false; dr.classList.toggle('prl-drawer-jg', SK().layout === 'jugaygana'); _paintBal(); _paintMenu();
        if (SK().layout === 'jugaygana') return; // F983: el menú oficial de JUGAYGANA no muestra saldo ni nivel
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
        // F983 (owner, captura del menú oficial de jugaygana44): en JUGAYGANA el ☰ es SÓLO Inicio · Casino · Casino en vivo · Eventos deportivos (sin Tareas diarias).
        if (SK().layout === 'jugaygana') {
            const jgi = (k, t, fn) => '<button type="button" class="jg-mi" onclick="VIP.lobby.menu(false);' + fn + '">' + ico(k) + '<span>' + t + '</span></button>';
            b.innerHTML = '<nav class="jg-menu">' + jgi('home', 'INICIO', "VIP.lobby.go('inicio')") + jgi('slots', 'CASINO', "VIP.lobby.go('slots')") +
                jgi('live', 'CASINO EN VIVO', "VIP.lobby.go('vivo')") + jgi('sport', 'EVENTOS DEPORTIVOS', "VIP.lobby.sport('" + esc((_sportsList()[0] || {}).path || '/sports-new') + "')") + '</nav>';
            return;
        }
        b.innerHTML =
            '<div class="prl-dr-head"><img src="' + SK().home + '" alt="" class="prl-logo"><div><b>' + esc(u.username || 'Mi cuenta') + '</b><small>' + SK().name + (SK().sub ? ' · ' + SK().sub : '') + '</small></div><button type="button" class="prl-x" onclick="VIP.lobby.menu(false)" aria-label="Cerrar">✕</button></div>' +
            '<div class="prl-dr-card"><small>Saldo</small><b class="prl-dr-bal">' + esc(_balText()) + '</b>' +
            '<div class="prl-dr-btns"><button type="button" class="prl-load" onclick="VIP.lobby.load()">Cargar</button><button type="button" class="prl-ghost" onclick="VIP.lobby.withdraw()">Retirar</button></div></div>' +
            '<div class="prl-dr-card"><small>Nivel y rango</small>' +
            (lv ? '<b class="prl-dr-lvl">' + esc(lv.emoji || '') + ' ' + esc(lv.name) + '</b>' : '<b class="prl-dr-lvl">Jugador</b><span class="prl-dr-sub">Todavía sin nivel</span>') +
            (nx ? '<div class="prl-bar"><i style="width:' + pct + '%"></i></div><span class="prl-dr-sub">' + pct + '% · te faltan ' + money(v.faltaParaSubir) + ' apostados para ' + esc((nx.emoji || '') + ' ' + nx.name) + '</span>' : (lv ? '<span class="prl-dr-sub">Nivel máximo</span>' : '')) + '</div>' +
            // #966 (owner: "todas las plataformas lo más parecido posible"): el MISMO menú en las 4 páginas (antes Deportes/Historias/Info sólo en JUGAYGANA).
            '<div class="prl-dr-list"><small class="prl-dr-cap">Deportes</small>' + _sportsList().map((sp) => item('sport', esc(sp.title), "VIP.lobby.menu(false);VIP.lobby.sport('" + esc(sp.path) + "')")).join('') + '</div>' + // #956
            '<div class="prl-dr-list">' + item('chat', 'Soporte', 'VIP.lobby.support()') + item('home', 'Mi perfil', 'VIP.lobby.profile()') +
            item('fire', 'Sorteos', "VIP.lobby.menu(false);VIP.sorteos.open('mensual')") + item('star', 'Historias', 'VIP.lobby.menu(false);VIP.stories.open()') + item('grid', 'Información', 'VIP.lobby.menu(false);VIP.home.casinoInfo()') +
            (window.VIP_SITE === 'jugaygana' ? '' : item('slots', 'Volver a la app', 'VIP.lobby.close(true)')) + '</div>';
    }
    function withdraw() { menu(false); try { VIP.withdraw.openWithdrawModal(); } catch (_) {} } // #914: el modal va arriba de la página (body.casino-open)
    function profile() { menu(false); try { VIP.home.openProfile(); } catch (_) {} }
    function top() { const m = $('prlMain'); if (m) m.scrollTo ? m.scrollTo({ top: 0, behavior: 'smooth' }) : (m.scrollTop = 0); }
    function load() { menu(false); try { VIP.home.toggleCasinoLoad(true); return; } catch (_) {} close(); try { VIP.home.setHomeMode('full'); } catch (_) {} } // #914: Carga rápida sobre la página
    function support() { menu(false); close(true); try { VIP.home.setHomeMode('mini'); } catch (_) {} } // #944: el chat de Soporte se abre aunque sea el sitio JUGAYGANA (site.js la vuelve a abrir al salir)
    // picaroja.com/paginaoficial ⇒ /?pr=1: se abre apenas la app tiene sesión.
    try {
        const _auto = /[?&]pr=1\b/.test(location.search) ? 'picaroja' : (/[?&]jg=1\b/.test(location.search) || window.VIP_SITE === 'jugaygana') ? 'jugaygana' : /[?&]gn=1\b/.test(location.search) ? 'ganamos' : /[?&]bp=1\b/.test(location.search) ? 'buffaloplay' : null; // #944: sitio JUGAYGANA ⇒ siempre // #912 /jugaygana ⇒ ?jg=1 · #914 /ganamosoficial ⇒ ?gn=1
        if (_auto) {
            let n = 0; const t = setInterval(() => { n++; if (VIP.state && VIP.state.currentToken && VIP.config) { clearInterval(t); try { VIP.home.openPlatform(_auto); } catch (_) { open('inicio', _auto); } try { history.replaceState(null, '', location.pathname); } catch (_) {} } else if (n > 60 && window.VIP_SITE !== 'jugaygana') clearInterval(t); }, 500); // #944: en el sitio JUGAYGANA espera el login el tiempo que haga falta
        }
    } catch (_) {}
    return { liveProv, sportOf: (p) => SPORT_KEYS[p] || null, open, close, go, all, provToggle, more, menu, withdraw, profile, top, search, play, sport, load, support, gcarScroll, jgSlideScroll, jgProv, jgCat, jgArrow, jgColl, jgList, jgProvOpen, gnRow, extraAll, listMore, gnProv, back, ql, sportsMenu, sportPick, bpFav, bpSlideScroll, bpSlideGo, bpRrScroll, bpTabGo, bpOpenTab, bpTabs, bpSearch, bpMore, bpNav, bpRefresh, skin: () => _skin };
})();
