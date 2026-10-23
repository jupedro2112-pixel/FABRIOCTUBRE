// ========================================
// #917 (owner 2026-10-23): SORTEO MENSUAL POR PUNTOS — transparente y real.
//  · Participan SÓLO los clientes registrados en la app de PICA ROJA que hicieron al menos una CARGA REAL en el mes (sin cuentas de
//    prueba, bloqueadas ni staff). Cuenta lo jugado en cualquier marca (PICA ROJA, JUGAYGANA, Ganamos, Girox): es la misma cuenta.
//  · Puntos = 100 cada $100.000 apostados CON PLATA REAL (1 punto cada $1.000). 1girox informa el apostado total y los bonos recibidos,
//    no separa con qué saldo se apostó; por eso el apostado VÁLIDO es la parte proporcional a la plata real:
//        válido = apostado × cargas reales / (cargas reales + bonos recibidos)
//    (si en el mes cargó $100.000 y recibió $50.000 de bonos, cuenta 2/3 de lo que apostó). Sin cargas reales = 0.
//  · Suma desde el día 1 00:00 hasta el último día 23:59:59 (hora argentina). El día 1 se cierra el mes anterior con los datos finales de
//    1girox y quedan congelados los ganadores (puestos 1, 2 y 3). Empate: más apostado válido; después, quien llegó antes.
//  · Lógica pura con dependencias inyectadas (deps = { models, girox, logger }) para poder probarla con Mongo en memoria.
// ========================================
const TZ_OFFSET = '-03:00'; // Argentina no tiene horario de verano
const POINTS_PER_ARS = 100 / 100000;
const GIFT_SOURCES = ['install_bonus', 'welcome_gift', 'welcome_code', 'payout_refund'];

const DEFAULT_CONFIG = {
  active: {
    title: 'Sorteo mensual',
    prizes: [
      { pos: 1, title: 'iPhone 18 Pro Max', detail: 'Nuevo, en caja sellada' },
      { pos: 2, title: 'Orden de compra $1.000.000', detail: 'Para usar en supermercado' },
      { pos: 3, title: '$500.000 para jugar', detail: 'En la plataforma que quieras' }
    ]
  },
  upcoming: {
    title: 'Gran Sorteo',
    // #921 (owner): también por puntos + EXTRAS por actividad: +10 por cada día con carga real ≥ $10.000 y +10% de los puntos de cada semana
    // en la que completó misiones semanales. Período editable (panel); ganan los 3 con más puntos al cierre.
    key: 'gran-1', start: '2026-11-01', end: '2027-01-31', dailyPoints: 10, dailyMinArs: 10000, missionPct: 10,
    prizes: [
      { pos: 1, title: 'Auto 0 km', detail: 'Valorado en $30.000.000' },
      { pos: 2, title: 'Viaje al Caribe para 2', detail: 'Todo incluido · 5 días' },
      { pos: 3, title: 'USD 2.000', detail: 'En efectivo' }
    ]
  },
  deliveryBusinessDays: 10,
  // #928 (owner): además, todos los participantes entran en un sorteo de $100.000 repartidos en 10 ganadores por cada 100 clientes con al menos
  // 2 cargas reales en el mes ($10.000 c/u). Se sortea al cierre, con un método verificable (hash del mes + cada cliente).
  extra: { enabled: true, pool: 100000, winnersPerGroup: 10, groupSize: 100, minDeposits: 2 },
  cashOption: true,
  startMonth: '2026-11' // #919 (owner): el sorteo arranca en noviembre; octubre no vale
};

function monthKeyOf(date) {
  const d = new Date(new Date(date || Date.now()).getTime() - 3 * 3600 * 1000); // a hora argentina
  return d.toISOString().slice(0, 7);
}
function monthRange(mk) {
  const [y, m] = mk.split('-').map(Number);
  const from = new Date(`${mk}-01T00:00:00${TZ_OFFSET}`);
  const nextMk = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  const to = new Date(new Date(`${nextMk}-01T00:00:00${TZ_OFFSET}`).getTime() - 1000); // último día 23:59:59
  return { from, to, nextMk };
}
function prevMonthKey(mk) { const [y, m] = mk.split('-').map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`; }
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
function monthLabel(mk) { const [y, m] = mk.split('-').map(Number); return MONTHS[m - 1] + ' ' + y; }
// "diego651917" → "di*******17": se ve el puesto sin exponer a nadie.
function mask(username) {
  const u = String(username || ''); if (u.length <= 3) return u.slice(0, 1) + '**';
  const keep = u.length >= 7 ? 2 : 1;
  return u.slice(0, keep) + '*'.repeat(Math.max(3, u.length - keep * 2)) + u.slice(-keep);
}
function pointsFor(validWagered) { return Math.floor(Math.max(0, Number(validWagered) || 0) * POINTS_PER_ARS); }
function validWageredFor(wagered, deposits, bonus) {
  const w = Math.max(0, Number(wagered) || 0); const d = Math.max(0, Number(deposits) || 0); const b = Math.max(0, Number(bonus) || 0);
  if (d <= 0 || w <= 0) return 0;
  return Math.round(w * d / (d + b));
}

// #929: requisitos para anotarse — app instalada con notificaciones (token FCM 'standalone' con permiso) + tocó "Unirme a Telegram".
function requirementsOf(u) {
  const toks = (u && Array.isArray(u.fcmTokens)) ? u.fcmTokens : [];
  const app = toks.some((t) => t && t.context === 'standalone') || (u && u.fcmTokenContext === 'standalone');
  const notif = app && (toks.some((t) => t && t.context === 'standalone' && (t.notifPermission === 'granted' || t.notifPermission == null)) || (u && u.notifPermission === 'granted'));
  const telegram = !!(u && u.raffleTelegramAt);
  return { app: !!app, notif: !!notif, telegram, ok: !!(app && notif && telegram) };
}
async function getConfig(deps) {
  try {
    const doc = await deps.models.Config.findOne({ key: 'raffleconfig' }).lean();
    const v = doc && doc.value;
    if (v && typeof v === 'object') return Object.assign({}, DEFAULT_CONFIG, v, { active: Object.assign({}, DEFAULT_CONFIG.active, v.active || {}), upcoming: Object.assign({}, DEFAULT_CONFIG.upcoming, v.upcoming || {}) });
  } catch (_) {}
  return DEFAULT_CONFIG;
}

// Cargas reales del mes por cliente (sin pruebas ni regalos).
// #928: clientes con al menos `min` cargas reales en el rango (mismas reglas que el sorteo: sin pruebas ni regalos, sólo clientes activos).
async function eligibleExtra(deps, from, to, min) {
  const rows = await deps.models.Transaction.aggregate([
    { $match: { type: 'deposit', status: 'completed', timestamp: { $gte: from, $lte: to }, description: { $not: /PRUEBA/i }, 'metadata.source': { $nin: GIFT_SOURCES } } },
    { $group: { _id: '$userId', n: { $sum: 1 } } }, { $match: { n: { $gte: min } } }
  ]);
  const users = await deps.models.User.find({ id: { $in: rows.map((r) => r._id) }, role: 'user', isBlocked: { $ne: true }, raffleJoinedAt: { $ne: null, $lte: to } }).select('id username').lean(); // #929: sólo anotados
  return users.filter((u) => u.username && !/^prueba|test/i.test(u.username));
}
// Sorteo verificable: cada cliente recibe sha256(mes + ':' + id); ganan los `k` valores más bajos. Con la lista de participantes cualquiera puede recalcularlo.
function drawExtra(mk, users, k) {
  const crypto = require('crypto');
  return users.map((u) => ({ u, h: crypto.createHash('sha256').update(mk + ':' + u.id).digest('hex') })).sort((a, b) => (a.h < b.h ? -1 : 1)).slice(0, k).map((x) => x.u);
}
async function depositsByUser(deps, from, to) {
  const rows = await deps.models.Transaction.aggregate([
    { $match: { type: 'deposit', status: 'completed', timestamp: { $gte: from, $lte: to }, description: { $not: /PRUEBA/i }, 'metadata.source': { $nin: GIFT_SOURCES } } },
    { $group: { _id: '$userId', total: { $sum: '$amount' } } }
  ]);
  return new Map(rows.filter((r) => r._id && r.total > 0).map((r) => [r._id, r.total]));
}

// Recalcula los puntos del mes (hasta `until`, o el fin de mes si ya pasó). Devuelve { participants, updated, errors }.
async function computeMonth(deps, mk, opts = {}) {
  const { User, RaffleScore } = deps.models;
  const { from, to } = monthRange(mk);
  const until = new Date(Math.min(to.getTime(), (opts.now ? new Date(opts.now) : new Date()).getTime()));
  const dep = await depositsByUser(deps, from, to);
  const users = await User.find({ id: { $in: [...dep.keys()] }, role: 'user', isBlocked: { $ne: true }, raffleJoinedAt: { $ne: null, $lte: until } }).select('id username raffleJoinedAt').lean(); // #929: sólo anotados
  const byLower = new Map(users.filter((u) => u.username && !/^prueba|test/i.test(u.username)).map((u) => [String(u.username).toLowerCase(), u]));
  // #929: cada uno suma DESDE que se anotó (si se anotó este mes) ⇒ se agrupan por hora de inicio para pedir stats y cargas de ese rango
  const groups = new Map();
  for (const u of byLower.values()) { const st = new Date(Math.max(from.getTime(), Math.floor(new Date(u.raffleJoinedAt).getTime() / 3600000) * 3600000)); const k = st.getTime(); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(u); }
  let updated = 0, errors = 0;
  for (const [stk, glist] of groups) {
  const gFrom = new Date(stk); const gDep = gFrom.getTime() === from.getTime() ? dep : await depositsByUser(deps, gFrom, to);
  for (let i = 0; i < glist.length; i += 100) {
    const chunk = glist.slice(i, i + 100);
    const r = await deps.girox.getPlayersStatsBatch(chunk.map((u) => u.username), gFrom, until, 'raffle-' + mk);
    if (!r || !r.success) { errors++; if (deps.logger) deps.logger.warn('[sorteo] batch ' + mk + ' falló: ' + ((r && r.error) || 's/detalle')); continue; }
    for (const [uname, st] of Object.entries(r.players || {})) {
      const u = byLower.get(String(uname).toLowerCase()); if (!u) continue;
      const deposits = Math.round(gDep.get(u.id) || 0);
      const wagered = Math.round(Math.max(0, Number(st.wagered) || 0));
      const bonusGranted = Math.round(Math.max(0, Number(st.bonusGranted) || 0));
      const validWagered = validWageredFor(wagered, deposits, bonusGranted);
      const points = pointsFor(validWagered);
      const prev = await RaffleScore.findOne({ monthKey: mk, userId: u.id }).select('points updatedAt').lean();
      // updatedAt sólo avanza cuando cambian los puntos: sirve de desempate ("quien llegó antes").
      const set = { username: u.username, deposits, wagered, bonusGranted, validWagered, points };
      if (!prev || prev.points !== points) set.updatedAt = new Date();
      await RaffleScore.updateOne({ monthKey: mk, userId: u.id }, { $set: set }, { upsert: true });
      updated++;
    }
  }
  }
  return { participants: byLower.size, updated, errors };
}

async function ranking(deps, mk, limit) {
  const q = deps.models.RaffleScore.find({ monthKey: mk, points: { $gt: 0 } }).sort({ points: -1, validWagered: -1, updatedAt: 1, userId: 1 });
  if (limit) q.limit(limit);
  return q.lean();
}

// Cierra el mes (idempotente: sólo el primero que lo pasa de open → closed congela ganadores).
async function closeMonth(deps, mk) {
  const { RaffleMonth } = deps.models;
  const already = await RaffleMonth.findOne({ monthKey: mk, status: 'closed' }).lean();
  if (already) return { closed: false, already: true };
  const c = await computeMonth(deps, mk, { now: monthRange(mk).to });
  if (c.errors) return { closed: false, error: 'faltan datos de 1girox; se reintenta' };
  const cfg = await getConfig(deps);
  const top = await ranking(deps, mk, 3);
  const winners = top.map((s, i) => ({ pos: i + 1, userId: s.userId, username: s.username, masked: mask(s.username), points: s.points, validWagered: s.validWagered, prize: ((cfg.active.prizes || [])[i] || {}).title || '' }));
  let extra = null; // #928: premio extra por cada 100 clientes con ≥ 2 cargas
  try {
    const ex = cfg.extra || {}; if (ex.enabled !== false) {
      const { from, to } = monthRange(mk); const el = await eligibleExtra(deps, from, to, Number(ex.minDeposits) || 2);
      const groups = Math.floor(el.length / (Number(ex.groupSize) || 100)); const k = groups * (Number(ex.winnersPerGroup) || 10);
      const per = Math.round((Number(ex.pool) || 100000) / (Number(ex.winnersPerGroup) || 10));
      extra = { eligible: el.length, groups, perWinner: per, method: 'sha256(mes:id) más bajos', winners: drawExtra(mk, el, k).map((u) => ({ userId: u.id, username: u.username, masked: mask(u.username), deliveredAt: null })) };
    }
  } catch (e) { extra = { error: e.message }; }
  const r = await RaffleMonth.updateOne({ monthKey: mk, status: { $ne: 'closed' } }, { $set: { status: 'closed', closedAt: new Date(), winners, participants: c.participants, extra } }, { upsert: true }).catch((e) => (e && e.code === 11000 ? { modifiedCount: 0 } : Promise.reject(e)));
  return { closed: !!(r && (r.modifiedCount || r.upsertedCount)), winners };
}

// ===== #921 GRAN SORTEO: puntos = los del sorteo mensual de cada mes del período (apostado con plata real) + 10 por día activo (carga real
// ≥ $10.000 ese día, hora argentina) + 10% de los puntos de cada semana (lunes a domingo) con misiones semanales completadas. =====
function granRange(g) { return { from: new Date(g.start + 'T00:00:00' + TZ_OFFSET), to: new Date(new Date(g.end + 'T00:00:00' + TZ_OFFSET).getTime() + 86400000 - 1000) }; }
function _monthsBetween(a, b) { const out = []; let mk = monthKeyOf(a); const last = monthKeyOf(b); while (mk <= last) { out.push(mk); const [y, m] = mk.split('-').map(Number); mk = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`; } return out; }
async function computeGran(deps, cfg, now) {
  const g = cfg.upcoming; if (!g || !g.start || !g.end) return { skipped: 'sin período' };
  const { from, to } = granRange(g); now = new Date(now || Date.now()); if (now < from) return { skipped: 'no empezó' };
  const until = new Date(Math.min(to.getTime(), now.getTime()));
  const { RaffleScore, Transaction, MissionClaim, User } = deps.models; const GK = 'G:' + g.key;
  // 1) base: puntos del sorteo mensual de los meses del período
  const months = _monthsBetween(from, until);
  const base = await RaffleScore.aggregate([{ $match: { monthKey: { $in: months } } }, { $group: { _id: '$userId', pts: { $sum: '$points' }, username: { $last: '$username' } } }]);
  const byUser = new Map(base.map((b) => [b._id, { username: b.username, base: b.pts, days: 0, weeks: 0, mpts: 0 }]));
  // 2) días activos: días con cargas reales ≥ dailyMinArs
  const days = await Transaction.aggregate([
    { $match: { type: 'deposit', status: 'completed', timestamp: { $gte: from, $lte: until }, description: { $not: /PRUEBA/i }, 'metadata.source': { $nin: GIFT_SOURCES } } },
    { $group: { _id: { u: '$userId', d: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp', timezone: TZ_OFFSET } } }, total: { $sum: '$amount' } } },
    { $match: { total: { $gte: Number(g.dailyMinArs) || 10000 } } }, { $group: { _id: '$_id.u', dayList: { $push: '$_id.d' } } }
  ]);
  for (const d of days) { const e = byUser.get(d._id) || { username: null, base: 0, days: 0, weeks: 0, mpts: 0 }; e.dayList = d.dayList; byUser.set(d._id, e); } // #929: se filtran por la fecha en que se anotó
  // 3) semanas con misiones: +missionPct% de los puntos de ESA semana (apostado con plata real de la semana, 1girox)
  if (MissionClaim) {
    const fromWk = new Date(from.getTime() - 7 * 86400000).toISOString().slice(0, 10);
    const claims = await MissionClaim.aggregate([{ $match: { status: 'credited', weekKey: { $gte: fromWk } } }, { $group: { _id: { u: '$userId', w: '$weekKey' } } }]);
    const weeks = new Map(); for (const c of claims) { const ws = new Date(c._id.w + 'T00:00:00' + TZ_OFFSET); if (ws < new Date(from.getTime() - 6 * 86400000) || ws > until) continue; if (!weeks.has(c._id.w)) weeks.set(c._id.w, []); weeks.get(c._id.w).push(c._id.u); }
    for (const [wk, uids] of weeks) {
      const ws = new Date(Math.max(new Date(wk + 'T00:00:00' + TZ_OFFSET).getTime(), from.getTime())); const we = new Date(Math.min(new Date(wk + 'T00:00:00' + TZ_OFFSET).getTime() + 7 * 86400000 - 1000, until.getTime()));
      const dep = await depositsByUser(deps, ws, we);
      const users = await User.find({ id: { $in: uids }, role: 'user', isBlocked: { $ne: true } }).select('id username').lean();
      for (let i = 0; i < users.length; i += 100) {
        const chunk = users.slice(i, i + 100); const r = await deps.girox.getPlayersStatsBatch(chunk.map((u) => u.username), ws, we, 'gran-' + wk);
        if (!r || !r.success) continue;
        const low = new Map(chunk.map((u) => [String(u.username).toLowerCase(), u]));
        for (const [un, st] of Object.entries(r.players || {})) {
          const u = low.get(String(un).toLowerCase()); if (!u) continue;
          const wp = pointsFor(validWageredFor(st.wagered, dep.get(u.id) || 0, st.bonusGranted));
          const e = byUser.get(u.id) || { username: u.username, base: 0, days: 0, weeks: 0, mpts: 0 };
          e.username = e.username || u.username; (e.wkList = e.wkList || []).push({ wk, pts: Math.round(wp * (Number(g.missionPct) || 10) / 100) }); byUser.set(u.id, e);
        }
      }
    }
  }
  // usuarios válidos (clientes, no bloqueados ni de prueba) y guardado
  const valid = await User.find({ id: { $in: [...byUser.keys()] }, role: 'user', isBlocked: { $ne: true }, raffleJoinedAt: { $ne: null } }).select('id username raffleJoinedAt').lean(); // #929: sólo anotados
  let n = 0;
  for (const u of valid) {
    if (/^prueba|test/i.test(u.username || '')) continue;
    const e = byUser.get(u.id); const jd = new Date(new Date(u.raffleJoinedAt).getTime() - 3 * 3600000).toISOString().slice(0, 10); // día (ART) en que se anotó
    e.days = (e.dayList || []).filter((d) => d >= jd).length; const wks = (e.wkList || []).filter((w) => w.wk >= new Date(new Date(jd + 'T00:00:00Z').getTime() - 6 * 86400000).toISOString().slice(0, 10));
    e.weeks = wks.length; e.mpts = wks.reduce((a, w) => a + w.pts, 0);
    const daily = e.days * (Number(g.dailyPoints) || 10); const total = e.base + daily + e.mpts;
    const prev = await RaffleScore.findOne({ monthKey: GK, userId: u.id }).select('points').lean();
    const set = { username: u.username, basePoints: e.base, dailyPoints: daily, missionPoints: e.mpts, activeDays: e.days, missionWeeks: e.weeks, points: total };
    if (!prev || prev.points !== total) set.updatedAt = new Date();
    await RaffleScore.updateOne({ monthKey: GK, userId: u.id }, { $set: set }, { upsert: true }); n++;
  }
  // cierre: el día siguiente al fin, una sola vez
  if (now > to) {
    const done = await deps.models.RaffleMonth.findOne({ monthKey: GK, status: 'closed' }).lean();
    if (!done) {
      const top = await ranking(deps, GK, 3);
      const winners = top.map((s, i) => ({ pos: i + 1, userId: s.userId, username: s.username, masked: mask(s.username), points: s.points, validWagered: s.validWagered || 0, prize: ((g.prizes || [])[i] || {}).title || '' }));
      await deps.models.RaffleMonth.updateOne({ monthKey: GK, status: { $ne: 'closed' } }, { $set: { status: 'closed', closedAt: new Date(), winners, participants: n } }, { upsert: true }).catch(() => {});
    }
  }
  return { participants: n };
}

// Candado entre instancias (AWS con varias + Render comparten la base): una sola calcula cada vez.
async function _lease(deps, ms) {
  const now = new Date();
  try {
    const r = await deps.models.RaffleMonth.findOneAndUpdate(
      { monthKey: 'lock', $or: [{ lockUntil: null }, { lockUntil: { $lt: now } }] },
      { $set: { lockUntil: new Date(now.getTime() + ms), status: 'lock', lastRunAt: now } },
      { upsert: true, new: true }
    );
    return !!r;
  } catch (e) { if (e && e.code === 11000) return false; throw e; }
}

// Cron (cada 20 min): el día 1 cierra el mes anterior; siempre recalcula el mes en curso.
async function tick(deps, opts = {}) {
  if (deps.girox.isSimulated && deps.girox.isSimulated()) return { skipped: 'simulado' }; // nunca datos del casino simulado en la base real
  if (deps.girox.isEnabled && !deps.girox.isEnabled()) return { skipped: 'sin API' };
  if (!(await _lease(deps, 15 * 60 * 1000))) return { skipped: 'otra instancia' };
  const now = opts.now ? new Date(opts.now) : new Date();
  const mk = monthKeyOf(now); const out = {};
  const start = (await getConfig(deps)).startMonth || DEFAULT_CONFIG.startMonth;
  if (mk < start) { await deps.models.RaffleMonth.updateOne({ monthKey: 'lock' }, { $set: { lockUntil: null } }).catch(() => {}); return { skipped: 'empieza en ' + start }; }
  const pk = prevMonthKey(mk);
  const pm = await deps.models.RaffleMonth.findOne({ monthKey: pk }).lean();
  const hasPrev = pk >= start && (pm ? pm.status !== 'closed' : (await deps.models.RaffleScore.countDocuments({ monthKey: pk })) > 0);
  if (hasPrev) out.close = await closeMonth(deps, pk);
  out.current = await computeMonth(deps, mk, { now });
  try { out.gran = await computeGran(deps, await getConfig(deps), now); } catch (e) { out.gran = { error: e.message }; }
  await deps.models.RaffleMonth.updateOne({ monthKey: mk }, { $set: { lastRunAt: new Date(), participants: out.current.participants }, $setOnInsert: { status: 'open' } }, { upsert: true }).catch(() => {});
  await deps.models.RaffleMonth.updateOne({ monthKey: 'lock' }, { $set: { lockUntil: null } }).catch(() => {});
  return out;
}

// Lo que ve el cliente (todo con nombres tapados, salvo él mismo).
async function publicStatus(deps, userId, opts = {}) {
  const now = opts.now ? new Date(opts.now) : new Date();
  const cfg = await getConfig(deps);
  const start = cfg.startMonth || DEFAULT_CONFIG.startMonth;
  const mk0 = monthKeyOf(now); const notStarted = mk0 < start; const mk = notStarted ? start : mk0;
  const { from, to, nextMk } = monthRange(mk);
  const all = await ranking(deps, mk);
  const myIdx = all.findIndex((s) => s.userId === userId);
  const mine = myIdx >= 0 ? all[myIdx] : await deps.models.RaffleScore.findOne({ monthKey: mk, userId }).lean();
  const firstPts = all.length ? all[0].points : 0;
  const meU = await deps.models.User.findOne({ id: userId }).select('raffleJoinedAt raffleTelegramAt fcmTokens fcmTokenContext notifPermission').lean();
  const req = requirementsOf(meU);
  const thirdPts = all.length >= 3 ? all[2].points : 0;
  const month = await deps.models.RaffleMonth.findOne({ monthKey: mk }).select('lastRunAt participants').lean();
  const last = await deps.models.RaffleMonth.findOne({ status: 'closed' }).sort({ monthKey: -1 }).lean();
  const myWin = last && (last.winners || []).find((w) => w.userId === userId);
  return {
    monthKey: mk, monthLabel: monthLabel(mk), notStarted, startsAt: from.toISOString(),
    closesAt: to.toISOString(), announceAt: new Date(`${nextMk}-01T12:00:00${TZ_OFFSET}`).toISOString(),
    updatedAt: month && month.lastRunAt ? month.lastRunAt : null,
    participants: all.length,
    rule: { pointsPer: 100, perArs: 100000 },
    deliveryBusinessDays: cfg.deliveryBusinessDays, cashOption: cfg.cashOption !== false,
    prizes: cfg.active.prizes, title: cfg.active.title, upcoming: cfg.upcoming,
    top: all.slice(0, 20).map((s, i) => ({ pos: i + 1, name: s.userId === userId ? s.username : mask(s.username), points: s.points, me: s.userId === userId })),
    joined: !!(meU && meU.raffleJoinedAt), joinedAt: meU && meU.raffleJoinedAt, requirements: req,
    me: {
      position: myIdx >= 0 ? myIdx + 1 : null, points: mine ? mine.points : 0, validWagered: mine ? mine.validWagered : 0, wagered: mine ? mine.wagered : 0,
      deposits: mine ? mine.deposits : 0, bonusGranted: mine ? mine.bonusGranted : 0,
      toFirst: myIdx === 0 ? 0 : Math.max(0, firstPts - (mine ? mine.points : 0) + 1),
      toPodium: myIdx >= 0 && myIdx < 3 ? 0 : Math.max(0, thirdPts - (mine ? mine.points : 0) + 1)
    },
    lastWinners: last ? { monthKey: last.monthKey, monthLabel: monthLabel(last.monthKey), winners: (last.winners || []).map((w) => ({ pos: w.pos, name: w.userId === userId ? w.username : w.masked, points: w.points, prize: w.prize, delivered: !!w.deliveredAt })) } : null,
    extra: await (async () => {
      const ex = cfg.extra || {}; if (ex.enabled === false) return null;
      const { from: ef, to: et } = monthRange(mk); const min = Number(ex.minDeposits) || 2;
      const el = notStarted ? [] : await eligibleExtra(deps, ef, et, min);
      const myN = notStarted ? 0 : await deps.models.Transaction.countDocuments({ userId, type: 'deposit', status: 'completed', timestamp: { $gte: ef, $lte: et }, description: { $not: /PRUEBA/i }, 'metadata.source': { $nin: GIFT_SOURCES } });
      const size = Number(ex.groupSize) || 100; const wpg = Number(ex.winnersPerGroup) || 10;
      const lx = last && last.extra && Array.isArray(last.extra.winners) ? last.extra : null;
      return { pool: Number(ex.pool) || 100000, winnersPerGroup: wpg, groupSize: size, minDeposits: min, perWinner: Math.round((Number(ex.pool) || 100000) / wpg),
        eligibleNow: el.length, winnersNow: Math.floor(el.length / size) * wpg, myDeposits: myN, imIn: myN >= min,
        last: lx ? { monthLabel: monthLabel(last.monthKey), eligible: lx.eligible, perWinner: lx.perWinner, winners: lx.winners.map((w) => (w.userId === userId ? w.username : w.masked)), meWon: lx.winners.some((w) => w.userId === userId) } : null };
    })(),
    gran: await (async () => {
      const g = cfg.upcoming || {}; if (!g.start || !g.end) return null; const { from: gf, to: gt } = granRange(g); const GK = 'G:' + (g.key || 'gran-1');
      const all2 = now < gf ? [] : await ranking(deps, GK); const i2 = all2.findIndex((x) => x.userId === userId); const m2 = i2 >= 0 ? all2[i2] : null;
      const gw = await deps.models.RaffleMonth.findOne({ monthKey: GK, status: 'closed' }).lean();
      return { title: g.title, startsAt: gf.toISOString(), endsAt: gt.toISOString(), notStarted: now < gf, closed: !!gw, prizes: g.prizes,
        dailyPoints: Number(g.dailyPoints) || 10, dailyMinArs: Number(g.dailyMinArs) || 10000, missionPct: Number(g.missionPct) || 10, participants: all2.length,
        top: all2.slice(0, 10).map((x, k) => ({ pos: k + 1, name: x.userId === userId ? x.username : mask(x.username), points: x.points, me: x.userId === userId })),
        me: { position: i2 >= 0 ? i2 + 1 : null, points: m2 ? m2.points : 0, base: m2 ? m2.basePoints : 0, daily: m2 ? m2.dailyPoints : 0, missions: m2 ? m2.missionPoints : 0, activeDays: m2 ? m2.activeDays : 0, missionWeeks: m2 ? m2.missionWeeks : 0, toFirst: i2 === 0 ? 0 : Math.max(0, (all2[0] ? all2[0].points : 0) - (m2 ? m2.points : 0) + 1) },
        winners: gw ? (gw.winners || []).map((w) => ({ pos: w.pos, name: w.userId === userId ? w.username : w.masked, prize: w.prize, delivered: !!w.deliveredAt })) : null };
    })(),
    myWin: myWin ? { monthKey: last.monthKey, monthLabel: monthLabel(last.monthKey), pos: myWin.pos, prize: myWin.prize, contactAt: myWin.contactAt, delivered: !!myWin.deliveredAt } : null
  };
}

module.exports = { requirementsOf, drawExtra, eligibleExtra, computeGran, granRange, DEFAULT_CONFIG, monthKeyOf, monthRange, prevMonthKey, monthLabel, mask, pointsFor, validWageredFor, getConfig, computeMonth, ranking, closeMonth, tick, publicStatus };
