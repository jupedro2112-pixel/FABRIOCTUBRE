// ============================================
// FIREBASE CLOUD MESSAGING + CACHE SERVICE WORKER
// SW único para notificaciones push Y caché PWA.
// Versión: 2.3.0
// ============================================
// ROOT CAUSE FIX: antes existían dos SWs (firebase-messaging-sw.js y
// user-sw.js) compitiendo en el mismo scope (/). Eso provocaba que el
// token FCM apuntara a un SW pero las notificaciones llegaran al otro,
// invalidando todos los envíos. Ahora este es el único SW activo.
// ============================================
// PWA WEBAPK FIX: Chrome Android exige que el SW responda (con
// event.respondWith) a la navegación hacia start_url para generar un
// WebAPK real. Si el SW ignora navigation requests (return sin llamar
// respondWith), Chrome no lo considera capaz de controlar start_url y
// sólo ofrece un acceso directo/shortcut en lugar de instalar la app
// como WebAPK. Se usa redirect:'manual' para que las redirecciones de
// Cloudflare Challenge sean seguidas por el navegador de forma nativa
// (opaqueredirect), sin que el SW actúe como proxy cross-origin.
// ============================================

// SDK Firebase self-hosted (mismo origen). Antes se importaba desde gstatic,
// pero en redes flaky ese host puede fallar y romper el SW entero. Sirviendo
// los scripts del propio dominio garantizamos que el SW siempre instale.
// Fallback a gstatic si el archivo local no estuviera disponible.
try {
  importScripts('/lib/firebase/9.1.2/firebase-app-compat.js');
  importScripts('/lib/firebase/9.1.2/firebase-messaging-compat.js');
} catch (localImportErr) {
  console.warn('[FCM-SW] No se pudo importar Firebase SDK local, cayendo a gstatic:', localImportErr && localImportErr.message);
  importScripts('https://www.gstatic.com/firebasejs/9.1.2/firebase-app-compat.js');
  importScripts('https://www.gstatic.com/firebasejs/9.1.2/firebase-messaging-compat.js');
}

// ============================================
// CONFIGURACIÓN DE CACHÉ
// ============================================
const CACHE_VERSION = 'v332'; // v332: historias con boton interno app:referidos (#474); usuario de prueba lalodj499910 (#476) // v331: dos fotos nuevas en el deslizante del Inicio (slots y lobbies en vivo 2x2) (#473) // v330: novedad en Referidos: el 5% baja al 3% en diciembre (#472) // v329: 'Ver la plataforma' con selector Girox / Ganamos (Pronto) / Jugaygana (Pronto) (#470) // v328: condiciones de referidos y niveles VIP estilo 1win, detalle por nivel y soporte Telegram para Black (#465) // v327: medidor de uso de la app (ping cada 60 s) para Datos IA (#459) // v326: reembolso 'de tu NETWIN' en inicio/menu; promo 'valida hasta diciembre' solo dentro de los modales (#458) // v325: historias rehechas sin pie interno (franja inferior libre), Soporte con los 3, arriba solo el nombre (#456) // v324: historias: logo + PICA ROJA arriba a la izquierda (Instagram), sello de abajo en blanco sin pildora (#455) // v323: barras de progreso de historias tipo Instagram (#454) // v322: historias tipo WhatsApp: foto completa, sello de marca al pie, sin bloque negro (#453) // v321: visor de historias: marca arriba, texto abajo sobre fondo negro desgastado sin pisar la foto (#452) // v320: modal 'Tu opinion' con el estilo de la app (#450) // v319: Menu facil con avatar + nombre desplegable (ver mas); sin 'GIROX - LA APP QUE PAGA' en la entrada (#448/#449) // v318: detalle de reembolsos en inicio solo con el % diario (#447) // v317: selector de reembolsos: tres botones rojos con letra blanca e iconos de linea (#446) // v316: iconos con mas presencia (trazo grueso, duotono, caja rojo claro) (#445) // v315: alerta del banco sin pausar si el panel lo configura asi (#443) // v314: alerta 'banco con fallas' en el retiro (#442) // v313: Inicio post-login con iconos de linea (entrada, menu facil, selector, instalar app) (#441) // v312: iconos de linea (Pinterest) en Info y Perfil en vez de emojis (#440) // v311: Info: texto de plataformas en su linea, solo Girox/Ganamos/Jugaygana en negrita (#439) // v310: Info: texto de 'La plataforma que quieras' en negrita (#438) // v309: 'Cerrar sesion' en Perfil tambien para diego294290 (#437) // v308: parte superior del inicio un poco mas abajo, centrada con la de abajo (#436) // v307: 'Pronto' en vez de 'Proximamente' en Elegi donde jugar (#435) // v306: fila prioritaria 'Carga automatica y atencion personalizada' arriba de los beneficios (#434) // v305: 'CARGAS Y PAGOS LAS 24 HS SIN LIMITES' bajo el titulo (#433) // v304: beneficios con texto completo en tres filas (VIP PICA ROJA, reembolsos diarios/semanales/mensuales, referidos) (#432) // v303: mas espacio entre bloques del inicio; 'Jugaygana' con J mayuscula (#431) // v302: inicio en exactamente una pantalla de telefono (sin scroll, opiniones con el alto sobrante), sin burbuja de Soporte (#430) // v301: inicio mas compacto para que las opiniones entren en la pantalla principal (#429) // v300: recuadro 'Elegi donde jugar' debajo de Registrarse (jugaygana en minuscula), sin linea de estrellas, opiniones visibles (#428) // v299: inicio solo 'Completa tu nombre para registrarte' + 'Registrarse ya'; sin olvide clave / soporte / ya tengo cuenta (#427) // v298: paso 'Te registraste con exito' con usuario y clave antes de entrar (#426) // v297: la entrada con nombre es LA forma de registro; sin 'Crear mi cuenta' (#425) // v296: ingreso con tarjetas de beneficios (VIP, reembolsos, elegi donde jugar, referidos) con iconos de linea (#424) // v295: Girox nunca 'Proximamente' en la fila del ingreso (#423) // v294: fila de las 3 plataformas en el ingreso, Ganamos y jugaygana 'Proximamente' (#423) // v293: entrada rapida automatica para quien llega por link de publicidad (#422) // v292: entrada rapida solo con el nombre cuando el registro esta desactivado en el panel (#421) // v291: boton de ingreso 'Iniciar sesion', mas chico (#420) // v290: ingreso mas compacto arriba, reseñas con comentario visible, burbuja de Soporte chica en la punta (#419) // v289: registro siempre visible (tambien con link de publicista), 'Olvide mi contraseña', registro = usuario + clave + telefono + SMS, 'Confirmar y entrar' (#418) // v288: ingreso como estaba (login visible + Crear mi cuenta), reseñas deslizandose, historias como anillo arriba a la derecha (#417) // v287: ingreso sin chips ni ticker; historias publicadas + opinion de la gente (reseña que rota) (#416) // v286: ingreso en UNA pantalla estilo registro de app (sin scroll, explicacion resumida, linea de confianza) (#415) // v285: ingreso como REGISTRO (SMS), soporte para visitantes (burbuja + panel), ticker sobrio con el final del nombre visible (#414) // v284: 'Cerrar sesion' al pie de Perfil solo para lalodj (#412) // v283: botones Comprobante aqui / Retirar premio a mitad y mitad sin desbordar (#409) // v282: Info: 'La plataforma que quieras' (texto nuevo, jugaygana en minuscula) (#407) // v281: Perfil: el link de la pagina va recto debajo del titulo, en una linea (#406) // v280: fueguito: requisito por MONTO cargado en N dias (no por cantidad de cargas) en textos del home y del modal (#405) // v279: Perfil reordenado (Canjear codigo arriba, Menu, Nocturno + Notificaciones, datos + Capturar, Fueguito, resto) y mas compacto (#404) // v278: etiquetas Telegram / Historias de la barra mas chicas, sin corte (#403) // v277: la barra 'Instala la app' pendiente ya no tapa Comprobante aqui / Retirar premio (#402) // v276: Soporte: la presentacion se va cuando el cliente ya escribio; cierre automatico a las 6 h sin respuesta y el chat arranca de cero para el (#401) // v275: Perfil: modo nocturno arriba con Activar/Desactivar, filas usuario/clave/pagina en una linea, Ocultar debajo de Copiar; nocturno: texto --p-inv sobre fondos negros (#399) // v274: modo nocturno solo dentro de Perfil, sin boton en la barra (#396) // v273: modo nocturno de la app (Perfil + barra, #392), Perfil con codigo de referido y clave visible (#393), ruleta sin probabilidades (#390), Retirar premio verde + 'Comprobante aqui' (#391), Info en tarjetas con titulo recuadrado (#394) // v272: 'Retirar premio' con minimo y 'pago automatico' afuera; textos de los botones editables // v271: chips de Soporte mandan solos; Cargar/Retirar responden con boton al sector // v270: plataformas de carga automatica en una fila de cuadrados // v269: codigo SMS en cada retiro // v268: pantalla de ingreso nueva (marca, servicio, reembolsos, plataformas, carga minima, resenas) // v267: pestanas de plataformas iguales (3 cuadrados) + Soporte independiente del chat viejo // v266: retiro minimo $10.000 configurable + 'pago automatico' en el modal de retiro // v265: JUGAYGANA como tercera plataforma (Proximamente) // v264: Soporte paralelo (chat nuevo desde hoy, respuestas firmadas por la persona de turno) // v263: carga automatica: aviso de comprobante duplicado, acuse 'recibimos tu comprobante', franja 'carga pendiente' y rechazo // v262: Soporte 100% soporte (sin cartel de carga automatica ni botones extra; bienvenida nueva) // v261: ruleta: como se desbloquea (carga minima), premio mayor 1 cada 1000, estado bloqueado // v260: Carga manual -> SOPORTE (Martin se presenta, chat con el estilo de la pagina) // v259: ruleta con el estilo nuevo + aviso 'promocion hasta diciembre' en reembolsos // v258: nombre de la app 'PICA ROJA oficial' + logo real de Telegram en la barra // v257: tema Pinterest (blanco, grises, rojo) en toda la app salvo Carga manual // v256: Info del servicio en un solo mensaje, sin app/notificaciones (quedan en Perfil) // v255: el selector facil/completo pregunta en cada arranque y tras 10 min afuera; boton 'Pasar al menu completo' // v254: MENU FACIL (selector al entrar + pantalla de 6 accesos grandes) // v253: al entrar a Carga manual el CBU aparece solo // v252: tarjeta CBU en el chat con 'Por favor enviar comprobante aqui' // v251: letras de la barra de arriba mas chicas, sin cortes // v250: fix endpoint del Telegram de la barra // v249: Telegram a la izquierda, colores en las puntas, 'Historias' mas chico // v248: HISTORIAS (anillo arriba a la derecha + visor) // v247: resenas: 'Deja tu opinion' fija y chica, el resto desliza // v246: Info del servicio con el reembolso diario // v245: tarjeta Reembolso del inicio con el % diario (25) // v244: icono nuevo (pica) + nombre CARGAS AUTOMATIC // v243: titulo/nombre de la app 'CARGAS AUTOMATICA' // v242: tarjeta del fueguito mas baja // v241: fotos del inicio mas grandes // v240: regla del fueguito en una linea // v239: 'Proximamente' visible debajo de Ganamos (tarjeta y pestana del Inicio) // v238: inicio sin puntitos ni etiqueta; boton de cargar abajo de la foto // v237: referidos 5% (texto desde el server) // v236: logo de Ganamos (pica violeta) + promedio de resenas con estrella parcial // v235: reembolso DIARIO de vuelta (25%), semanal 3%, mensual 1%, cartel NOVEDAD en Inicio // v234: JS/CSS network-first (los deploys se ven en la primera apertura); regla del fueguito arriba del modal // v233: fueguito: 'minimo 10 cargas entre racha y racha' visible aunque el server no mande el valor // v232: premios del fueguito x5 en los textos por defecto // v231: texto del fueguito: minimo 5 cargas entre racha y racha // v230: fueguito: la condicion se ve adentro del modal (estaba oculta), minimo 5 cargas por racha // v229: carga manual: avatar de asistente mujer y 'Escribi aqui' en el campo // v228: sin parpadeo del login con sesion guardada; verificacion general sin errores // v227: sin el boton 'Link casino aqui' en carga auto y manual // v226: regla del fueguito (minimo 10 cargas por racha, si no vuelve a 0) a la vista en la tarjeta // v225: carga auto: el panel scrollea adentro, los botones de abajo no se enciman // v224: boton rojo encima de la foto (sin reservar lugar) y sin leyenda abajo // v223: recuadro de fotos al espacio que sobra: Inicio sin deslizar, opiniones a la vista // v222: sin el boton LINK CASINO en el Inicio // v221: puntos del carrusel arriba del boton rojo (no detras de LINK CASINO) // v220: ajuste y centrado por modelo (chico/estandar/grande, tablet centrada, bajos, safe areas) en Inicio, carga auto y manual // v219: carga automatica ocupa toda la pantalla y escala en telefonos altos (Samsung A56 etc.) // v218: fotos del Inicio con la version pegada al link (sin cache viejo) // v217: fotos del Inicio con nombres nuevos (g1..g5) y en el orden pedido; sin fotos anteriores // v216: 'LINK CASINO AQUI · www.1girox.com' como boton en el Inicio y en carga auto/manual // v215: sin el boton 'Ver completas' en las fotos // v214: boton 'Link plataforma' abajo de carga auto y carga manual (abre el casino para jugar) // v213: fotos nuevas del carrusel del Inicio (5 grillas de juegos) // v212: fondo como estaba antes (se quitaron los cambios de tono #321/#325) // v211: fondo un poco mas oscuro y barra superior con el mismo fondo // v210: leyenda del carrusel = link de la plataforma (www.1girox.com) que abre aparte adentro de la app // v209: boton 'Ver completas / Achicar' en las fotos del Inicio (pantalla completa) // v208: fotos completas en el Inicio (recuadro con altura propia) y boton chiquito sobre el final de la foto // v207: fondo azul profundo (mas claridad), vidrio un poco mas claro // v206: boton de cargar en una linea, mas bajo // v205: etiqueta 'FOTO ILUSTRATIVA · aca no se juega' en cada foto y leyenda clara // v204: foto principal de la pagina completa de Girox primera en el carrusel, con recuadro fino tipo pantalla // v203: opiniones de jugadores con mas vida (vidrio, estrellas doradas, insignia de promedio) // v202: sin la linea 'Vista ilustrativa' en el Inicio // v201: boton grande 'Para cargar ahora mismo · apreta aqui' debajo de las fotos // v200: fotos del Inicio a todo el ancho con recuadro y fondo desenfocado // v199: tests tambien con la app instalada para el usuario de prueba // v198: Inicio con carrusel de fotos ilustrativas de Girox (cada 2 s) en vez de la pagina embebida // v197: numero de version visible en Perfil (app vNNN) // v196: con la app instalada no hay test ni para lalodj (funciona como app real) // v195: Inicio siempre al entrar; carga minima tambien en el paso 2 y en el cartel del chat // v194: cabecera del chat 'Carga manual' con asistente // v193: perfil con avatar (recuadro de usuario, selector de iconos, iconos de nivel que se desbloquean) // v192: recarga automatica al entrar una version nueva; tarjetas Girox/Ganamos compactas en carga auto; saldo con el numero abajo // v191: carga minima $5.000 siempre visible (linea en la tarjeta + boton), aun sin redeploy // v190: Girox siempre elegible (nunca 'Proximamente') // v189: Girox siempre seleccionable; Ganamos como estaba (pestaña abre su pagina) con etiqueta Proximamente // v188: carga minima $5.000 en el boton de comprobante y el paso 1 (configurable); iconos de casino discretos y patron tenue de fondo // v187: aviso premium 'la unica app que paga todo en el momento' en el Inicio; Ganamos visible como 'Proximamente' (no seleccionable hasta tener API) // v186: Jugar ahora abre la plataforma afuera con autologin y linea finita 'Volver a cargas'; tests solo para el usuario de prueba; textos segun plataformas habilitadas (Ganamos apagada) // v185: 'Adjuntar comprobante aqui'; un solo cartel (Jugar ahora + extra por instalar) y barra pendiente de punta a punta; fueguito del inicio como estaba, premios plegables y condicion abajo en el modal; niveles VIP abren la escalera (tambien en el test); sin Soporte en vivo en Perfil // v184: niveles VIP escalera 1win (19 niveles) con la plata que desbloquea cada nivel // v183: Info sin opiniones ni ruleta; nivel VIP al lado del saldo con la app instalada (+test); fueguito con barra de niveles y regla de cargas minimas // v182: oferta por instalar la app = % EXTRA sobre la carga (50%), 'cargarlo ahora' o 'despues de jugar' // v181: Informacion del servicio con el estilo de la barra de arriba (recuadros de vidrio, texto grande) // v180: sin globo flotante de soporte // v179: barra de arriba 'Carga auto' // v178: 'Recomendado' debajo de Girox // v177: carga gratis — 'la instalo despues' pinta el boton grande de abajo tambien en test y sin depender del server // v176: pasos 1 y 2 de 'Carga aca' en recuadros, compactos (sin scroll) // v175: carga GRATIS por instalar la app en la primera carga (hoja de oferta, boton grande pendiente, reclamo desde la app instalada, test) // v174: 'Carga aca' centrada con paso 2 (adjunta la foto abajo); boton 'Carga aqui (adjunta la foto aqui)' // v173: opiniones deslizan solas (pausa al tocar) // v172: carrusel de opiniones con 30 reseñas al azar por apertura // v171: vuelven las paginas embebidas al entrar (sin modo logo) // v170: Inicio en modo logo (sin cargar la web), 'Ver pagina' desde el 2º ingreso, texto explicativo grande con links, test de 2º ingreso // v169: nota 'vista ilustrativa · para cargar usa la barra de arriba' en el Inicio // v168: cartel 'Jugar ahora' al acreditarse la carga (abre la plataforma adentro de la app) + boton test chiquito en carga manual y automatica // v167: Perfil en estilo oscuro // v166: resenas discretas (sin fondo blanco) con 'Deja tu opinion' primero; sin aviso de verificar telefono // v165: toda la barra con el estilo del Inicio (iconos SVG, vidrio, corte diamantado); Fueguito diario arriba de la carga automatica // v164: carga automatica con alias+titular y explicacion de plataformas (sin Entrar); Fueguito diario entre Cargar y Retirar; cartel del chat corto 'Recomendable' + Ir a carga automatica // v163: Inicio moderno/futurista (sin retro); resenas tipo Google deslizantes al pie del Inicio; Perfil con usuario/clave/link protagonistas + capturar // v162: Inicio al centro, separado y retro; reembolso / ruleta / referidos arriba del Inicio; carga automatica sencilla // v161: barra de arriba Inicio / Carga automatica / Carga manual / Info / Perfil (usuario+clave, cambiar clave, notificaciones, canal, codigo, instalar, fueguito); sin botones abajo en la entrada // v160: pantalla de entrada — Girox abierto adentro, Ganamos para cambiar, Carga manual / Carga automatica // v159: chat estilo WhatsApp como pantalla principal + cartel 'Servicio completo' con menu deslizante (Ver todo) que despliega la app completa // v158: circulos de la cabecera mas chicos // v157: cabecera apenas mas baja // v156: franja del saldo a la mitad de alto // v155: Instalar app (IMPORTANTE) al lado del saldo; abajo Referidos + Como funciona en una linea // v154: app instalada → casino adentro con carga rapida en formato CARGA (descartable); navegador → aparte con barra Volver // v153: el casino se abre APARTE en /jugar.html con barra 'Volver a la app' (login por API; Ganamos su web; prueba = home publica) // v152: Android sin prompt — info con boton 'Apreta aca para abrir en Google Chrome' (link de acceso directo) // v151: bono de nivel VIP a reclamar con cartel de felicidades y eleccion de plataforma; home compactada en una pantalla; saldo arriba // v150: niveles VIP sin plata — solo nivel y porcentajes // v149: 'Recomendado' en rojo en el recuadro de Girox // v148: Info del servicio — app+notis en una linea arriba, titulo chico, ruleta plegada en vez de niveles VIP // v147: tarjeta de nivel VIP con barra de progreso y escalera desbloqueable debajo de Guarda tu acceso // v146: circulo de arriba 'Soporte aqui' con icono de chat (sin logo de Girox) // v145: Retirar premio en una linea, fila de acciones a la mitad de alto // v144: niveles VIP plegados debajo de reseñas en Info del servicio // v143: instalar app — Android con prompt instala directo, iPhone/otros ven los pasos, Instagram en Android abre Chrome; el botón dice qué va a pasar // v142: fix div sobrante de la tarjeta de carga; Retirar 'se retira automaticamente'; circulo de arriba restaura la burbuja // v141: tarjeta de carga sin paso 2; Cargar aqui dice adjuntar comprobante / se carga automaticamente // v140: prueba = página principal de cada casino; burbuja con ícono de chat y X adentro // v139: Probá las plataformas mejor presentado; modo prueba sin la carga rápida dentro del casino // v138: fila de reembolsos sin recortes + modal de reembolso simple estilo cambio de clave // v137: burbuja de soporte compacta (foto), se saca con X y queda arriba al lado del fueguito // v136: cobro de referidos desde la app, aviso de clave inicial, tarjetas de plataforma chicas con logo (Ganamos violeta) // v135: referidos — como funciona plegado, el resto en una pantalla // v134: fila Cargar aqui (adjuntar comprobante) + Retirar mi premio en rojo // v133: info del servicio — reseñas plegadas arriba, niveles VIP detallados abajo, una hoja centrada // v132: pruebas de plataforma y Ganamos SIEMPRE dentro de la app (recuadro embebido), nada de Chrome // v131: pruebas de plataforma (Girox/Ganamos en Chrome) dentro del soporte // v130: 'Guardá tu acceso a la app' plegable debajo de reembolsos con la captura adentro // v129: fueguito resumido (racha + reclamar + premios) // v128: '¿Dónde querés jugar?' arriba del CBU — tocar = elegir (queda fija), Entrar abre con sesión // v127: burbuja flotante 'Soporte en vivo aquí' (arrastrable, minimizable, abierta al entrar) en vez de la fila; campana y fueguito en los círculos de arriba // v126: info del servicio nueva (por qué elegirnos, reembolsos NOVEDAD, ruleta), reembolsos verdes 'Cobrá tu reembolso acá', ruleta del home, captura solo link/usuario/clave // v125: carga en 2 pasos (CBU → comprobante, acceso secundario) + RETIRAR verde grande con brillo // v124: link de la app completo en la tarjeta de carga // v123: rojo de marketing, arriba al mínimo, reembolsos a la mitad, plataforma FIJA, cómo funciona separado abajo, modales en formato nuevo // v122: barra de soporte sin cortes en pantallas angostas // v121: tema diamante/futurista (vidrio, cian/violeta, cortes diamantados, Montserrat) — chau serif // v120: cabecera de círculos (Canal/Info/Código/Instalar/Clave) sin menú desplegable, carga compacta, barra del casino con plataformas + volver al menú de cargas, estilo premium negro/dorado // v119: home limpia — chau bono por instalar la app, cómo funciona plegado arriba, barra inferior REFERIDOS / INSTALAR APP, explicación completa en el chat // v118: HOME 2.0 — carga automática al frente (CBU/alias/datos de acceso/captura), chat como SOPORTE arriba, plataformas para elegir dónde jugar, cómo funciona el servicio, reembolsos compactos // v117: multi-plataforma — botones "¿dónde querés jugar?" (Girox / Ganamos) y link externo en los mensajes de sistema // v116: Información del Servicio y mini-tarjeta muestran el % vigente del bono por instalar la app (chau 100% fijo)
// v115: // v115: ruleta diaria con premios en % y tabla de probabilidades + bonos pendientes se aplican solos en la carga + sin bono de bienvenida para registros manuales
// v114: // v114: el cartel del bono por instalar la app toma el % y los textos del server (editables en COMANDOS) — chau 100% fijo
// v113: // v113: REEMBOLSO ACUMULATIVO de por vida en el perfil (tarjeta + reclamar + actualizar) — ESPEC-REEMBOLSO-1GIROX
// v112: // v112: la burbuja del casino ahora es una PASTILLA con logo 1G + "CARGA RÁPIDA" (no más 🎧 que parecía soporte de la página), el panel arranca ABIERTO al entrar, y pista de que se puede arrastrar
const CACHE_NAME = 'sala-juegos-fcm-' + CACHE_VERSION;

// Logs por-fetch del SW (corren en CADA request). Apagados por default;
// poner SW_DEBUG = true para diagnosticar. Los logs de install/activate quedan.
const SW_DEBUG = false;
function _slog() { if (SW_DEBUG) console.log.apply(console, arguments); }

const PRECACHE_URLS = [
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png'
];

// Determina si un asset (no navegación) debe usar network-first.
// NOTA: Las navigation requests (modo 'navigate') se excluyen antes de
// llegar aquí, por lo que NO es necesario listar '/' ni '/index.html'.
function isNetworkFirst(url) {
  // #348: TODO el JS/CSS propio va network-first (el server los manda con no-cache): el deploy se ve en la
  // PRIMERA apertura, sin esperar a la siguiente (antes stale-while-revalidate servía el JS viejo una vez más).
  // Sin red, cae al caché.
  try {
    var u = new URL(url);
    if (u.origin === self.location.origin && (u.pathname.indexOf('/js/') === 0 || u.pathname.indexOf('/css/') === 0)) return true;
  } catch (e) {}
  return (
    url.includes('/app.js') ||
    url.includes('/manifest.json')
  );
}

// Módulos JS/CSS propios: stale-while-revalidate — se sirven del caché
// (rápido, igual que antes) pero se revalidan en background, así un deploy
// llega a los clientes en la SIGUIENTE carga sin bumpear CACHE_VERSION a mano
// (causa raíz de los bugs "fantasma" de código viejo cacheado).
function isStaleWhileRevalidate(url) {
  try {
    var u = new URL(url);
    if (u.origin !== self.location.origin) return false;
    // Se incluye /img/ (fondos del chat): son archivos que no cambian nunca y
    // pesan decenas de KB — servirlos del caché evita que el chat aparezca sin
    // fondo mientras cargan en una conexión lenta.
    return u.pathname.indexOf('/js/') === 0
        || u.pathname.indexOf('/css/') === 0
        || u.pathname.indexOf('/img/') === 0;
  } catch (e) {
    return false;
  }
}

// Verifica si una URL pertenece a Cloudflare u otros dominios de seguridad
// que NUNCA deben pasar por el caché del SW.
function isCloudflareOrSecurityUrl(url) {
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname === 'challenges.cloudflare.com' ||
      parsed.hostname.endsWith('.cloudflare.com') ||
      parsed.pathname.startsWith('/cdn-cgi/')
    );
  } catch (e) {
    return false;
  }
}

// ============================================
// CONFIGURACIÓN DE FIREBASE
// ============================================
const firebaseConfig = {
  apiKey: "AIzaSyAjZuVIxNY-SrnihkyNVupZ8AhXX6qxAxY",
  authDomain: "saladejuegos-673fa.firebaseapp.com",
  projectId: "saladejuegos-673fa",
  storageBucket: "saladejuegos-673fa.firebasestorage.app",
  messagingSenderId: "553123191180",
  appId: "1:553123191180:web:277eb460ef78dab8525ea9",
  measurementId: "G-3ZJRT0NCTE"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

console.log('[FCM-SW] Firebase Messaging Service Worker v4 iniciado');

// ============================================
// NOTIFICACIONES EN BACKGROUND (FCM SDK)
// ============================================
messaging.onBackgroundMessage(function(payload) {
  console.log('[FCM-SW] Notificación en background:', payload);

  const notif = payload.notification || {};
  const webNotif = (payload.webpush && payload.webpush.notification) || {};

  const title = notif.title || webNotif.title || 'Sala de Juegos';
  const body  = notif.body  || webNotif.body  || 'Tienes un mensaje del soporte';
  const icon  = notif.icon  || webNotif.icon  || '/icons/icon-192x192.png';
  const badge = notif.badge || webNotif.badge || '/icons/icon-72x72.png';
  const tag   = (payload.data && payload.data.tag) || 'chat-message';

  // Confirmación de entrega: si el envío vino con batchId+userId, avisar al
  // backend que el push llegó realmente (cubre el falso "enviado" cuando
  // FCM acepta el mensaje pero la subscription estaba muerta).
  const _data = payload.data || {};
  if (_data.batchId && _data.userId) {
    fetch('/api/notifications/confirm-delivery', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ batchId: _data.batchId, userId: _data.userId }),
      keepalive: true
    }).catch(function (err) {
      console.warn('[FCM-SW] confirm-delivery falló:', err && err.message);
    });
  }

  const options = {
    body,
    icon,
    badge,
    tag,
    requireInteraction: false,
    data: _data,
    actions: [
      { action: 'open',  title: 'Abrir chat' },
      { action: 'close', title: 'Cerrar'     }
    ],
    vibrate: [200, 100, 200]
  };

  return self.registration.showNotification(title, options);
});

// ============================================
// CLICK EN NOTIFICACIÓN
// ============================================
self.addEventListener('notificationclick', function(event) {
  console.log('[FCM-SW] Click en notificación:', event.action);

  event.notification.close();

  if (event.action === 'close') return;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(function(clientList) {
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow('/');
        }
      })
  );
});

// ============================================
// INSTALACIÓN
// ============================================
self.addEventListener('install', function(event) {
  console.log('[FCM-SW] Instalando', CACHE_VERSION);

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache) {
        return cache.addAll(PRECACHE_URLS);
      })
      .catch(function(err) {
        console.log('[FCM-SW] Error al pre-cachear:', err);
      })
  );

  self.skipWaiting();
});

// ============================================
// ACTIVACIÓN
// ============================================
self.addEventListener('activate', function(event) {
  console.log('[FCM-SW] Activado', CACHE_VERSION);

  // IMPORTANT: clients.claim() must be inside event.waitUntil so that
  // navigator.serviceWorker.ready only resolves AFTER the SW is actually
  // controlling the page. If claim() is called outside waitUntil, the
  // ready promise may resolve before navigator.serviceWorker.controller
  // is set, causing getToken() to fail in standalone/PWA mode because
  // FCM internally checks the controller state.
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.map(function(name) {
          if (name !== CACHE_NAME) {
            console.log('[FCM-SW] Eliminando caché antiguo:', name);
            return caches.delete(name);
          }
        })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

// ============================================
// FETCH (ESTRATEGIA DE CACHÉ)
// ============================================
self.addEventListener('fetch', function(event) {
  if (event.request.method !== 'GET') return;

  const url = event.request.url;

  // PWA WEBAPK FIX: responder a navigation requests con fetch de red
  // (sin caché). Esto es imprescindible para que Chrome Android verifique
  // que el SW controla start_url y genere un WebAPK real en lugar de un
  // acceso directo. redirect:'manual' devuelve opaqueredirect para
  // redirecciones cross-origin (p. ej. Cloudflare Challenge), que Chrome
  // sigue de forma nativa sin que el SW actúe como proxy.
  if (event.request.mode === 'navigate') {
    _slog('[FCM-SW] Navigation request - respondiendo con red (sin caché):', url);
    event.respondWith(
      fetch(event.request, { redirect: 'manual' })
        .catch(function() {
          _slog('[FCM-SW] Red no disponible para navegación:', url);
          return new Response('Sin conexión - por favor verificá tu internet.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          });
        })
    );
    return;
  }

  // Excluir URLs de Cloudflare, cdn-cgi y cualquier dominio de seguridad.
  if (isCloudflareOrSecurityUrl(url)) {
    _slog('[FCM-SW] URL de seguridad excluida del caché:', url);
    return;
  }

  // Excluir API y sockets: siempre van a red.
  if (url.includes('/api/') || url.includes('/socket.io/')) return;

  if (isStaleWhileRevalidate(url)) {
    event.respondWith(
      caches.match(event.request).then(function(cached) {
        var network = fetch(event.request).then(function(response) {
          if (response && response.status === 200 && response.type === 'basic') {
            var toCache = response.clone();
            caches.open(CACHE_NAME).then(function(cache) {
              cache.put(event.request, toCache);
            });
          }
          return response;
        }).catch(function() {
          // Sin red: si había caché ya se devolvió; si no, propagar el fallo.
          return cached;
        });
        return cached || network;
      })
    );
    return;
  }

  if (isNetworkFirst(url)) {
    // Network-first: siempre intenta red para que los deploys sean inmediatos.
    _slog('[FCM-SW] Network-first para:', url);
    event.respondWith(
      fetch(event.request)
        .then(function(response) {
          if (response && response.status === 200 && response.type === 'basic') {
            var toCache = response.clone();
            caches.open(CACHE_NAME).then(function(cache) {
              cache.put(event.request, toCache);
            });
          }
          return response;
        })
        .catch(function() {
          _slog('[FCM-SW] Red no disponible, buscando en caché:', url);
          return caches.match(event.request);
        })
    );
  } else {
    // Cache-first para assets estáticos estables (iconos, fuentes, etc.)
    event.respondWith(
      caches.match(event.request)
        .then(function(cached) {
          if (cached) {
            _slog('[FCM-SW] Cache hit para:', url);
            return cached;
          }
          _slog('[FCM-SW] Cache miss - red para:', url);
          return fetch(event.request).then(function(response) {
            if (response && response.status === 200 && response.type === 'basic') {
              var toCache = response.clone();
              caches.open(CACHE_NAME).then(function(cache) {
                cache.put(event.request, toCache);
              });
            }
            return response;
          });
        })
        .catch(function() {
          return undefined;
        })
    );
  }
});

// ============================================
// MENSAJES DESDE LA APP
// ============================================
self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
