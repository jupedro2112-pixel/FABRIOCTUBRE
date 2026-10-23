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
      { pos: 1, title: 'Auto 0 km', detail: 'Valorado en $10.000.000' },
      { pos: 2, title: 'iPhone 18 Pro Max', detail: 'Nuevo, en caja sellada' },
      { pos: 3, title: '$500.000', detail: 'En efectivo' }
    ]
  },
  upcoming: {
    title: 'Gran Sorteo',
    prizes: [
      { pos: 1, title: 'Auto 0 km', detail: 'Valorado en $30.000.000' },
      { pos: 2, title: 'Viaje al Caribe para 2', detail: 'Todo incluido · 5 días' },
      { pos: 3, title: 'USD 2.000', detail: 'En efectivo' }
    ]
  },
  deliveryBusinessDays: 10,
  cashOption: true
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

async function getConfig(deps) {
  try {
    const doc = await deps.models.Config.findOne({ key: 'raffleconfig' }).lean();
    const v = doc && doc.value;
    if (v && typeof v === 'object') return Object.assign({}, DEFAULT_CONFIG, v, { active: Object.assign({}, DEFAULT_CONFIG.active, v.active || {}), upcoming: Object.assign({}, DEFAULT_CONFIG.upcoming, v.upcoming || {}) });
  } catch (_) {}
  return DEFAULT_CONFIG;
}

// Cargas reales del mes por cliente (sin pruebas ni regalos).
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
  const users = await User.find({ id: { $in: [...dep.keys()] }, role: 'user', isBlocked: { $ne: true } }).select('id username').lean();
  const byLower = new Map(users.filter((u) => u.username && !/^prueba|test/i.test(u.username)).map((u) => [String(u.username).toLowerCase(), u]));
  const list = [...byLower.values()];
  let updated = 0, errors = 0;
  for (let i = 0; i < list.length; i += 100) {
    const chunk = list.slice(i, i + 100);
    const r = await deps.girox.getPlayersStatsBatch(chunk.map((u) => u.username), from, until, 'raffle-' + mk);
    if (!r || !r.success) { errors++; if (deps.logger) deps.logger.warn('[sorteo] batch ' + mk + ' falló: ' + ((r && r.error) || 's/detalle')); continue; }
    for (const [uname, st] of Object.entries(r.players || {})) {
      const u = byLower.get(String(uname).toLowerCase()); if (!u) continue;
      const deposits = Math.round(dep.get(u.id) || 0);
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
  return { participants: list.length, updated, errors };
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
  const r = await RaffleMonth.updateOne({ monthKey: mk, status: { $ne: 'closed' } }, { $set: { status: 'closed', closedAt: new Date(), winners, participants: c.participants } }, { upsert: true }).catch((e) => (e && e.code === 11000 ? { modifiedCount: 0 } : Promise.reject(e)));
  return { closed: !!(r && (r.modifiedCount || r.upsertedCount)), winners };
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
  const pk = prevMonthKey(mk);
  const pm = await deps.models.RaffleMonth.findOne({ monthKey: pk }).lean();
  const hasPrev = pm ? pm.status !== 'closed' : (await deps.models.RaffleScore.countDocuments({ monthKey: pk })) > 0;
  if (hasPrev) out.close = await closeMonth(deps, pk);
  out.current = await computeMonth(deps, mk, { now });
  await deps.models.RaffleMonth.updateOne({ monthKey: mk }, { $set: { lastRunAt: new Date(), participants: out.current.participants }, $setOnInsert: { status: 'open' } }, { upsert: true }).catch(() => {});
  await deps.models.RaffleMonth.updateOne({ monthKey: 'lock' }, { $set: { lockUntil: null } }).catch(() => {});
  return out;
}

// Lo que ve el cliente (todo con nombres tapados, salvo él mismo).
async function publicStatus(deps, userId, opts = {}) {
  const now = opts.now ? new Date(opts.now) : new Date();
  const mk = monthKeyOf(now); const { to, nextMk } = monthRange(mk);
  const cfg = await getConfig(deps);
  const all = await ranking(deps, mk);
  const myIdx = all.findIndex((s) => s.userId === userId);
  const mine = myIdx >= 0 ? all[myIdx] : await deps.models.RaffleScore.findOne({ monthKey: mk, userId }).lean();
  const firstPts = all.length ? all[0].points : 0;
  const thirdPts = all.length >= 3 ? all[2].points : 0;
  const month = await deps.models.RaffleMonth.findOne({ monthKey: mk }).select('lastRunAt participants').lean();
  const last = await deps.models.RaffleMonth.findOne({ status: 'closed' }).sort({ monthKey: -1 }).lean();
  const myWin = last && (last.winners || []).find((w) => w.userId === userId);
  return {
    monthKey: mk, monthLabel: monthLabel(mk),
    closesAt: to.toISOString(), announceAt: new Date(`${nextMk}-01T12:00:00${TZ_OFFSET}`).toISOString(),
    updatedAt: month && month.lastRunAt ? month.lastRunAt : null,
    participants: all.length,
    rule: { pointsPer: 100, perArs: 100000 },
    deliveryBusinessDays: cfg.deliveryBusinessDays, cashOption: cfg.cashOption !== false,
    prizes: cfg.active.prizes, title: cfg.active.title, upcoming: cfg.upcoming,
    top: all.slice(0, 20).map((s, i) => ({ pos: i + 1, name: s.userId === userId ? s.username : mask(s.username), points: s.points, me: s.userId === userId })),
    me: {
      position: myIdx >= 0 ? myIdx + 1 : null, points: mine ? mine.points : 0, validWagered: mine ? mine.validWagered : 0, wagered: mine ? mine.wagered : 0,
      deposits: mine ? mine.deposits : 0, bonusGranted: mine ? mine.bonusGranted : 0,
      toFirst: myIdx === 0 ? 0 : Math.max(0, firstPts - (mine ? mine.points : 0) + 1),
      toPodium: myIdx >= 0 && myIdx < 3 ? 0 : Math.max(0, thirdPts - (mine ? mine.points : 0) + 1)
    },
    lastWinners: last ? { monthKey: last.monthKey, monthLabel: monthLabel(last.monthKey), winners: (last.winners || []).map((w) => ({ pos: w.pos, name: w.userId === userId ? w.username : w.masked, points: w.points, prize: w.prize, delivered: !!w.deliveredAt })) } : null,
    myWin: myWin ? { monthKey: last.monthKey, monthLabel: monthLabel(last.monthKey), pos: myWin.pos, prize: myWin.prize, contactAt: myWin.contactAt, delivered: !!myWin.deliveredAt } : null
  };
}

module.exports = { DEFAULT_CONFIG, monthKeyOf, monthRange, prevMonthKey, monthLabel, mask, pointsFor, validWageredFor, getConfig, computeMonth, ranking, closeMonth, tick, publicStatus };
