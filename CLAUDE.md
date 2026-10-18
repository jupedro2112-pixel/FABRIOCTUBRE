# CLAUDE.md — Contexto del proyecto VIPCARGASANTINO

> ⚠️ **LEER PRIMERO (continuidad entre sesiones).** El owner trabaja en **Tails sin
> almacenamiento persistente**: al reiniciar la PC se borra TODO lo local y vuelve a
> clonar este repo desde GitHub. Por eso el contexto vive ACÁ (en el repo), no en la
> memoria local del asistente.
>
> **REGLA PERMANENTE (los 3 docs vivos):** tras cada cambio significativo (feature,
> fix importante, decisión de diseño) mantené actualizados:
>   1. `WORKLOG.md` — QUÉ se hizo y por qué (diario de sesiones, entrada numerada).
>   2. `docs/ARCHITECTURE.md` — CÓMO funciona (si el cambio altera un flujo, modelo,
>      endpoint o agrega una trampa nueva, reflejalo ahí; corregí lo que quede stale).
>   3. `CLAUDE.md` (este archivo) — solo si cambió algo del CONTEXTO de arranque
>      (estructura, gotchas de primer nivel, reglas de trabajo).
> Commiteá y pusheá a GitHub para que la próxima sesión pueda seguir donde se dejó.
> Esta regla aplica siempre, sin que el owner tenga que pedirlo cada vez. El objetivo:
> que una sesión nueva en Tails sepa TODO leyendo estos docs, sin re-analizar el repo.
>
> Al iniciar una sesión nueva: leé `WORKLOG.md` (estado actual) y `docs/ARCHITECTURE.md`
> (mapa completo de modelos, flujos, front y trampas — actualizado 2026-07-09 tras una
> lectura de punta a punta del repo). Antes de modificar un flujo central, leé además
> el código puntual del área. El código es la verdad; los docs son el mapa.

---

## Qué es

Backend de una **sala de juegos** (mercado argentino) que opera como wrapper sobre la
plataforma externa **1girox** (Partner API REST/JSON; panel en `admin.1girox.com`).
Capta usuarios, los crea en la plataforma por API, gestiona cargas/retiros vía CBU,
reembolsos, ruleta, fueguito, referidos y campañas/publicistas. UX en PWA con
notificaciones push (FCM).

> **Migración 2026-07-31:** antes el wrapper era sobre **JUGAYGANA** (`admin.agentesadmin.bet`). Los clientes viejos
> (`jugaygana.js`, `jugaygana-movements.js`, `jugayganaService.js`, `jugayganaPublisherSessions.js`,
> `referralRevenueService.js`, `jugayganaUserLinkService.js`) se **ELIMINARON del repo el 2026-10-18 (#410)**: están en el
> historial de git si hiciera falta mirarlos. No confundir con `src/platforms/jugaygana.js` (adaptador nuevo, #378).

**Stack:** Node 20 · Express · MongoDB (Atlas) · Mongoose · Socket.IO (+ Redis adapter
para multi-instancia en AWS EB) · Firebase Admin (FCM) · AWS SNS (SMS OTP).
Deploy: AWS Elastic Beanstalk. Dominio público: vipcargas.com. Git user: jupedro2112-pixel.

## Estructura

- `server.js` (~15.7k líneas) — entry point. ~180 rutas, authMiddleware inline (~L2477),
  Socket.IO (~L7325), motores cron por setInterval (~L14100+), bootstrap async con SSM
  (final del archivo). Comentario dice "en migración" pero en la práctica sigue
  creciendo acá. (Los números de línea derivan con cada cambio — usar grep.)
- `config/database.js` — el `connectDB` que server.js realmente usa (TTL de mensajes,
  proxy a /src/models). **OJO: hay DOS connectDB** (este y `src/models/index.js`); el
  segundo NO se usa desde server.js. No tocar schemas en config/database.js (sólo
  define ExternalUser y UserActivity; el resto es proxy a /src/models).
- `src/services/giroxService.js` — **cliente ÚNICO de la Partner API** (altas, saldo,
  cargas, retiros, bonos, cambio de clave y login único/SSO).
- `src/services/giroxUserLinkService.js` — resuelve y cachea `User.giroxUserId`.
- `src/services/giroxPublisherKeys.js` — alta de jugadores con la API key del publicista.
- `src/utils/periodRanges.js` — rangos de fecha (ayer / semana / mes) en hora argentina.
- `src/platforms/` — **multi-plataforma (2026-10-16):** registro (`index.js`), adaptador girox
  (envoltura de giroxService), **esqueleto de Ganamos** (`ganamos.js`, mismo contrato, sin API
  hasta cargar `GANAMOS_API_URL`/`GANAMOS_API_KEY`) **y de JUGAYGANA** (`jugaygana.js`, #378, ídem con `JUGAYGANA_*`;
  logo en `public/images/jugaygana.png`). Checklist para conectarla: `docs/PLATFORMS.md`.
- `src/models/` — schemas Mongoose canónicos (fuente de verdad). `Story.js` (#361) = HISTORIAS de la app que
  publica el admin (panel → Historias; PWA `js/stories.js`, anillo arriba a la derecha al lado de Perfil; vencen por
  horas, `Config['storiesConfig']`). No confundir con `InfluencerStory` (placements de publicistas).
- `src/services/` — lógica (referidos, notificaciones, otp, metaCapi, fbAds, hgcash,
  comprobantes IA, analítica publicistas…).
- `public/` — PWA del cliente (namespace global `window.VIP`, SW único
  `firebase-messaging-sw.js`). **Tema visual (#370):** `css/pin.css` se carga ÚLTIMO y re-pinta todo en estilo
  "Pinterest" (blanco/grises/rojo) salvo la Carga manual (chat WhatsApp): cualquier color nuevo en la PWA va ahí
  COMO TOKEN `--p-*` (en `:root` + override en `html[data-theme="dark"]`, **modo nocturno #392**, `localStorage vip_theme`,
  botón 🌙 en la barra y en Perfil), nunca un color fijo ni en chat.css con neón. `public/adminprivado2026/` — panel admin (~12k líneas
  de admin.js, cookie httpOnly, SW propio `admin-sw.js` con scope /adminprivado2026/). **Tema (#383):** `pin-admin.css`
  se carga último y pisa el tema oscuro (mismo estilo que la app). **Modo nocturno (#388):** `html[data-theme="dark"]`
  redefine los tokens `--p-*` (default dark, `localStorage admin_theme`, botón en el pie del menú): cualquier color nuevo
  del panel va como token en `:root` + override en el bloque dark, nunca fijo. COMANDOS se arma por sectores con
  `initCommandsAccordion` (#389: tarjetas abiertas con color/icono/descr. desde `CMD_ACC_DESC`; mueve nodos, no cambia ids).

## Cosas que NO hay que romper (gotchas)

- **EL REPO ES PÚBLICO en GitHub (#413).** Nunca escribir claves, hashes, tokens ni API keys en código ni en docs (ni en el
  WORKLOG al citar pedidos del owner: reemplazar por "[clave]"). Credenciales siempre por env/SSM o por el panel (cifradas).
  La clave del admin `iginte1000` se rotó el 2026-10-18 y vive sólo en manos del owner.

- **JWT_SECRET y otros secrets** se cargan desde AWS SSM en el bootstrap async, NO al
  `require()`. Por eso hay lazy getters en `src/middlewares/auth.js` y rutas.
- **IDEMPOTENCIA POR `reference` (lo más importante de la plataforma nueva).** Cargas,
  retiros y bonos llevan una `reference` única por operación. Reintentar con la MISMA
  no duplica (la API devuelve `duplicate:true`). Se rompe plata en las dos direcciones:
  si dos operaciones DISTINTAS comparten reference, la segunda **no se acredita** (el
  cliente transfiere y no recibe fichas); si la reference **cambia** entre reintentos
  del mismo pago, se paga **dos veces**. Por eso cada flujo la deriva de una llave que
  ya es única y estable (id de Transaction, periodKey del reembolso, movimiento
  bancario, id del giro/payout). Ver la tabla de prefijos `vip-*` en ARCHITECTURE §.
- **Rate limit: 60 req/min** en la Partner API. Hay un limitador local (`GIROX_MAX_RPM`,
  default 55) pero es **por proceso** → con N instancias en EB el techo real es N×55 y
  el 429 sigue siendo posible (se reintenta respetando `Retry-After`).
- **Rollover ACTIVO en la plataforma:** el jugador puede tener saldo que NO puede
  retirar. Validar retiros contra `wagering.available`, **nunca** contra `balance`.
- **El netwin sale de la Partner API** (`GET /players/{username}/stats`, v1.8), por
  username y con la misma API key. ⚠️ `netwin` POSITIVO = el jugador PERDIÓ (es la base
  del reembolso); negativo = ganó. Máximo 92 días por consulta, y el rango se evalúa
  en hora argentina del lado de la plataforma. Para varios jugadores está el batch
  (`POST /players/stats/batch`, hasta 100) — es lo que hace viable el cálculo de
  comisiones de referidos sin comerse el límite de 60 req/min.
- **Reembolsos por RANGO**, según lo perdido EN EL PERÍODO que se reclama — no un acumulado.
  Ver `src/utils/refundTiers.js`. **Desde #349 (2026-10-17) hay TRES períodos: DIARIO (sobre lo
  perdido ayer, todos los días) 25% · SEMANAL 3% · MENSUAL 1%**, planos (un solo rango sin techo),
  editables en Comandos → Rangos de reembolso. El diario había sido eliminado el 2026-08-07 (#153).
  Cartel "NOVEDAD" del Inicio: `/sys_entry_news` ({pct} = % diario).
  **Desde 2026-09-11 la base es la pérdida sobre plata REAL** (`netwin −
  bonus.granted` del período) y además existe el **reembolso ACUMULATIVO de por
  vida** (`_cashbackStateToday`, `src/utils/cashbackFormula.js`, modelo
  `CashbackClaim`) que sigue `docs/ESPEC-REEMBOLSO-1GIROX.md` de la gemela: pct% de
  (neto de por vida − TODO lo regalado, reembolsos cobrados incluidos) − cobrado.
  Un tipo nuevo de regalo ⇒ sumarlo a `CASHBACK_GIFT_TX_TYPES`. Validar cambios con
  `node scripts/test-cashback-spec.js`. Detalle: ARCHITECTURE §5.
- **Regalos = BONO 0 "regalo directo" (2026-09-07, v1.10+):** reembolsos, ruleta,
  rakeback, nivel VIP, referidos e instalación se acreditan con `creditUserBalance`
  → `/bonus` con `multiplier: 0` (figura como Bono en 1girox, retirable al instante,
  no pisa el bono en curso), con precheck contra GET /config y fallback automático a
  depósito libre (misma reference) si el bono rebota por negocio. Kill switch:
  `GIROX_GIFT_AS_BONUS=0`. El **fueguito** con rollover >0 va por `/bonus` con ese
  multiplier (si el jugador ya tiene bono activo cae a depósito con multiplier — no
  pisarle el bono). La **devolución de retiro rechazado** sigue como depósito (no es
  regalo). La ruleta ahora escribe Transaction type 'roulette'. Detalle: ARCHITECTURE §4.5.
- **Bonos AUTOMÁTICOS en la carga con TOPE (2026-09-18):** todo bono en % pendiente
  (app, código de bienvenida, ruleta diaria, lote) lo aplica `resolveAutoBonus` en la
  carga manual y en hgcash — X% hasta `Config['bonusCap'].capArs` ($20.000) y `restPct`
  (20%) sobre el resto (`src/utils/bonusCap.js`, test `scripts/test-bonus-cap.js`). Pisa
  el bonus del agente y deja nota interna. Registro manual (`createdByAgent` /
  `acquisitionSource:'manual'`) = sin bonos de bienvenida. **#290:** la PRIMERA carga real lleva
  `Config['firstDepositBonusPct']` (50%, panel) si no hay otro bono pendiente. Ruleta diaria: premios en
  `Config['dailyRoulette']` (panel), % pendiente en `User.dailyRoulettePendingPct`.
- **Roles:** `user`, `admin` (todo), `depositor` (solo cargas), `withdrawer` (solo
  retiros), `publisher_admin` (solo crea usuarios de su publicista — lockdown via
  `PUBLISHER_ADMIN_ALLOWED_PATHS`).
- **Auth:** JWT por header Authorization O por cookie httpOnly `admin_api_session`
  (el panel admin usa cookie).
- **Mensajes automáticos al usuario** son editables desde la sección COMANDOS
  (comandos `/sys_*`). Usar el helper `renderSystemCommand(name, fallback, vars)` para
  cualquier mensaje automático nuevo. **Ningún % de bono hardcodeado en textos**
  (owner 2026-09-17, varían por mes/día): va a Config + variable (ej. `{pct}` del bono
  por instalar la app, `Config['installBonusPct']`, editable en COMANDOS).
- **API de 1girox desde el panel (#310, 2026-10-17):** Base URL + key en Config['giroxCredentials'] (cifradas con
  `JWT_SECRET`, panel > env/SSM, `giroxService.setCredentialsOverride`). Sin API, `connected:false` ⇒ la landing no
  crea cuentas y el casino no abre; se arregla cargándola en COMANDOS → Banco automático → "🎰 API de 1girox".
- **hgcash desde el panel (2026-10-07):** token de API y secreto del webhook se cargan
  en Comandos → Banco automático (cifrados con `JWT_SECRET` en `Config['hgcashCredentials']`,
  **panel > SSM**; el webhook acepta la firma con cualquiera de los dos secretos). El
  reenvío de avisos a otras páginas sale de `Config['hgcashFanout']` (si existe) o de
  `HGCASH_FANOUT_URL`. Rotar `JWT_SECRET` ⇒ recargar las credenciales en el panel.
- **Transaction** (cargas/retiros) es permanente (sin TTL). **Message** tiene TTL de 3
  días. La analítica de clientes se basa en Transaction.
- **Montos en PESOS.** ⚠️ Ojo si mirás código o docs viejos: JUGAYGANA trabajaba en
  centavos y todo se multiplicaba ×100. **1girox NO** — se manda el monto tal cual, con
  decimales si hace falta. Multiplicar por 100 sería cargar 100 veces de más.
- **No hay NINGUNA sesión que renovar.** Auth por `X-Api-Key` fija en todo, incluido
  el netwin. Se fueron `ensureSession`, el mutex de login, `isHtmlBlocked` y el Bearer
  del panel (con `giroxReportsService`, eliminado el 2026-07-31).
- **Bonos automáticos APAGADOS por flags** (owner 2026-06-24): `INACTIVIDAD_DISABLED`
  y `BONUS_STRATEGY_DISABLED` (server.js) + `CHARGE_BONUSES_DISABLED`
  (notificationRulesService) + bonos de encuesta con `bDays=[]`. Tope 30% en TODO lo
  automático (cap de lectura en `_getActivePromoBonus` incluido).
- **Ruleta diaria NO activa → ninguna push la menciona** (owner 2026-08-30): guard
  `isRouletteText` en `notificationService.js` bloquea toda push con texto de ruleta.
  No agregar mensajes automáticos que la nombren; si se reactiva, quitar el guard.
- **Multi-instancia (AWS EB):** los crons son `setInterval` en CADA instancia; su
  idempotencia depende de índices únicos (EncuestaFire.slotKey, InactividadFire.fireKey,
  HgcashCharge.chargeKey, DailyRouletteSpin userId+dateKey). No quitar esos índices.
- **Front frágil:** cientos de `onclick` inline dependen de funciones en `window.*`
  (no renombrar exports sin actualizar el HTML/strings). Tabla de usuarios del panel
  acoplada a `USERS_LIST_FIELDS` del backend (columna nueva ⇒ sumar campo al select).
  Detalle completo de trampas en `docs/ARCHITECTURE.md` §7.

- **Landing de pauta en el repo (#224):** `public/landing/index.html` servida en `GET /l/:code` (y `/ingreso` = campaña
  orgánica `INGRESO` que crea el boot, #306; `/l/demo` = vista previa sin cuentas); el alta
  crea el usuario en TODAS las plataformas con API conectada. **Plataforma fija (#225):**
  `User.preferredPlatform` evita la pregunta al cargar. ⚠️ En scripts de edición usar
  `s.replace(from, () => to)`: un `$'` en el texto nuevo rompe el archivo (pasó con server.js).
- **Bono por instalar la app APAGADO por flag (#221, 2026-10-16):** `Config['installBonusEnabled']`
  (default false; panel → COMANDOS). Sin flag no hay cartel ni claim; lo ya reclamado se honra. El
  cartel dorado y las tarjetas del modal Info se ELIMINARON de la PWA. `/sys_install_app` es neutro
  (sin regalo) y una migración al boot pisa el texto viejo con "$5.000".
- **HOME 2.0 de la PWA (#220, 2026-10-16) + chat principal (#266, 2026-10-17):** hay CUATRO modos
  (`VIP.home.setHomeMode`, `sessionStorage vip_home_mode`). **easy (#366, MENÚ FÁCIL):** `#easyView` con saldo,
  CARGAR AHORA, reembolso / ruleta / referidos / ver la plataforma, ayuda por chat; se elige en el selector que aparece en CADA arranque
  y tras 10 min en segundo plano (#367; `localStorage vip_menu_pref` = 'easy'|'full' sólo fija dónde arranca; cambiable en Perfil) y "Inicio" (`goHome`) lo respeta. **play (entrada, #267):** `#entryView` con
  tabs Girox/Ganamos y la web pública de la plataforma embebida + botones Carga manual (→ mini) /
  Carga automática (→ full). **mini (= SOPORTE desde #373; antes "Carga manual"):** se entra al CHAT
  (`#supportPanel` inline con cabecera `#waHead` "Soporte" y la presentación de Martín `#supportIntro`, textos
  `/sys_support_*`; estilo de la página, ya no WhatsApp; sin botón CBU ni CBU automático) y el home completo
  (`#homeFull`: carga automática `js/autoload.js`, plataformas, VIP, reembolsos…) queda plegado arriba
  bajo el cartel "⭐ SERVICIO COMPLETO · Ver todo" (texto `/sys_home_banner`, `{pct}` =
  `Config['autoLoadBonusPct']` — desde #274 es también el bono REAL de toda carga hgcash sin otro bono
  pendiente, con tope, vía `resolveAutoBonus`). **full:** el home desplegado y el chat
  como burbuja/overlay. Los ids del chat (`chatMessages`, `messageInput`, `attachBtn`…) siguen siendo
  los mismos: no moverlos.

- **Niveles VIP = escalera de 1win editable (#292, 2026-10-17):** 19 niveles en `src/utils/vipLevels.js`
  (Bronce II US$5k … Black V US$5.000M × tasa 1500; bono al subir 0,1% del umbral). Overrides por idx en
  `Config['vipLevelsConfig']` (panel → Niveles VIP → escalera), recargados por `vipLevels.refreshFromConfig`.
  Los idx se persisten en `User.vipLevel` y en las references `vip-lvl-*`: sólo agregar niveles AL FINAL.

- **% EXTRA por instalar la app (#283/#290, 2026-10-17):** en la PRIMERA carga de un cliente sin la app se le
  ofrece pct% (50%) de esa carga (tope) como EXTRA si la instala; queda como botón grande pendiente abajo hasta que reclame
  desde la app instalada (`User.installGift`, rutas `/api/install-gift/*`, `Config['installGift']`, ref
  `vip-igift-<userId>`, Transaction `install_gift` — un tipo de regalo nuevo va SIEMPRE a
  `CASHBACK_GIFT_TX_TYPES`). Detalle: ARCHITECTURE Home 2.0 (#283).

- **Ganamos "Próximamente" hasta tener la API (#298, 2026-10-17):** sigue habilitada y visible, pero con
  `connected:false` no se puede elegir ni se ofrece al cargar (`decideForDeposit` filtra por API). Se vuelve
  seleccionable sola al configurar `GANAMOS_API_URL/KEY`. El tilde de COMANDOS la esconde del todo si hace falta.
  El usuario `lalodj` recibe `role:'admin'` en cada arranque **sólo en el entorno de prueba** (`RENDER=true`, que Render
  pone solo, o `TESTER_ADMIN_PROMOTE=1`; en AWS/producción NO — #355 seguridad). La clave la pone el owner, nunca en
  el código. Es el único que ve los botones "test" de la PWA (`TESTER_USERNAMES` en home.js).

- **Multi-plataforma (#219, 2026-10-16):** con 2+ plataformas habilitadas en Configuración →
  "Plataformas de juego", la auto-carga hgcash **pregunta al cliente dónde jugar** (botones en el
  chat) y deja el movimiento en `awaiting_platform`; elige / el agente elige / timeout → se carga en
  esa plataforma con su adaptador (`platforms.getAdapter`). Ganamos sin API ⇒ el cliente va al
  link externo (www.ganamosvip.me) y el movimiento queda `redirected` (NO hay Transaction acá).
  Todo lo que mueva plata "a la plataforma" en un flujo nuevo resuelve el adaptador y escribe
  `Transaction.platform`; reembolsos/VIP/lotes/referidos siguen `girox.*` directo a propósito.

- **Planes de estrategia e impacto real (#293, 2026-10-17):** `StrategyPlan` (plantilla del mes) se aplica
  creando ScheduledCampaign con `notes = 'Plan "<nombre>" …'` (el reporte agrupa por eso: no cambiar el formato).
  `_batchImpact` mide primera carga + cargas siguientes (mismo día / 7 d) + recuperados por antigüedad sin
  cargar; lo usan el detalle del lote y `cronograma-report`. El envío manual de lotes sigue intacto.

- **Soporte paralelo (#377, 2026-10-18):** el cliente ve el chat sólo desde `Config['supportChannelSince']` (el historial
  viejo queda para el panel). Respuestas desde la columna Soporte → `channel:'support'` y firmadas por la persona de turno
  (`/sys_support_names`, rota cada 8 h). No borres ese Config: volvería a mostrar todo el chat viejo a los clientes.
  **#380:** el cliente ve SOLO canal support + mensajes de sistema; lo que un agente escribe desde la sección Chats NO le
  llega (ni al recargar ni por socket). Responder soporte = columna 💬 Soporte del panel.
  **#442:** `Config['bankOutage']` (banco con fallas): si está activa, `POST /api/withdrawal/request` responde 503 `BANK_OUTAGE`.
  Un flujo nuevo de pago por banco debe llamar `_bankPayoutFailed()` / `_bankPayoutOk()` para que la detección automática siga.
  **#421:** `Config['registrationMode']` ('sms' | 'quick', tilde en Configuración → Registro de clientes). En 'quick' la pantalla
  de ingreso pide sólo el nombre y `POST /api/auth/quick-entry` reutiliza `_landingSignupHandler` (campaña INGRESO) + link de
  acceso = autologin. Cambios en el alta de la landing afectan también a la entrada rápida.
  **#414:** hay un SOPORTE PARA VISITANTES sin cuenta (pantalla de ingreso → `GuestThread`, rutas `/api/public/support/*`
  con token secreto; panel → columna "Visitantes" de Soporte, `/api/admin/guest-support/*`). No mezcla con `Message`.
  **#401:** además cada cliente tiene `User.supportSessionSince`: el cron `_supportAutoCloseTick` (10 min) lo pone a "ahora" cuando
  respondimos y el cliente no contestó en `Config['supportAutoCloseHours']` (6 h) ⇒ para él el chat arranca de cero (vuelve la
  presentación); el panel ve todo igual. Un filtro nuevo de mensajes del cliente debe respetar ese campo.
- **Cargas pendientes (#376, 2026-10-18):** la carga manual del panel vive en `_agentDepositHandler(req, res, body)`
  (la ruta `POST /api/admin/deposit` sólo la llama) porque "Confirmar" de la cola de comprobantes la reusa. Todo comprobante
  válido queda `Comprobante.reviewStatus='pending'` hasta que se acredita (auto o manual) o se rechaza; si tocás el flujo de
  comprobantes/hgcash, mantené esos cierres (`reviewStatus`), si no el cliente ve "carga pendiente" para siempre.
- **Lotes y Cronograma (#218):** el POST `/api/admin/notif-batches` es un wrapper de
  `_createNotifBatchFromBody(body, user)`; cualquier validación/efecto nuevo del lote va en esa
  función (así lo heredan las campañas programadas). Las rutas del cronograma son
  `/api/admin/cronograma*` porque `/api/admin/campaigns` YA es de publicistas: no reusar ese path.

## Flujo de trabajo del asistente

1. Leer `WORKLOG.md` al iniciar.
2. Hacer el cambio. Validar sintaxis (`node --check` en archivos tocados — no hay
   node_modules local, así que no se puede correr el server; sólo syntax check).
   En cambios de la PWA: bumpear `CACHE_VERSION` de `public/firebase-messaging-sw.js` **y** el texto
   `app vNNN` de `#appBuildTag` en `public/index.html` (mismo número; es la versión visible en Perfil, #309).
3. Actualizar `WORKLOG.md`.
4. Commitear y pushear a `main` cuando el owner lo pida (o si pidió "todo seguido").
