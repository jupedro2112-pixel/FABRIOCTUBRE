// #459/#461 (owner 2026-10-18): DATOS IA — análisis del negocio a partir de los datos recolectados (sin IA externa).
// Capas: (1) datos por agregaciones de Mongo (sólo lo necesario del rango + cohorte), (2) métricas, (3) informe por reglas,
// (4) comparativa con "la otra página", (5) calculador de inversión con calibración (factor real/proyectado de revisiones
// anteriores). Hora argentina para los cortes. Diseñado para rangos de hasta 400 días sin cargar todo el historial.
'use strict';
const TZ = 'America/Argentina/Buenos_Aires';
const GIFT_SOURCES = ['install_bonus', 'welcome_gift', 'payout_refund'];
// #469: lo que la casa REGALA (todo lo que no es carga ni retiro)
const PROMO_TYPES = ['bonus', 'refund', 'roulette', 'fire_reward', 'rakeback', 'vip_levelup', 'install_gift', 'referral_commission'];
const PROMO_LABEL = { bonus: 'bonos de carga', refund: 'reembolsos', roulette: 'ruleta', fire_reward: 'fueguito', rakeback: 'rakeback', vip_levelup: 'nivel VIP', install_gift: 'extra por instalar', referral_commission: 'referidos' };
const DAY = 86400000;

// #463: Argentina es UTC−3 fijo (sin horario de verano): se calcula por desplazamiento. Intl.toLocaleDateString por cada
// movimiento era lentísimo y reventaba la memoria (268 MB de heap en Render) con 30+ días.
function dateKeyART(d) { const t = (d instanceof Date ? d.getTime() : new Date(d).getTime()) - 3 * 3600000; return new Date(t).toISOString().slice(0, 10); }
function bucketOf(d, gran) {
  const k = dateKeyART(d);
  if (gran === 'month') return k.slice(0, 7);
  if (gran === 'week') { const [y, m, dd] = k.split('-').map(Number); const dt = new Date(Date.UTC(y, m - 1, dd)); dt.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 6) % 7)); return dt.toISOString().slice(0, 10); }
  return k;
}
function listBuckets(from, to, gran) { const out = [], seen = new Set(); for (let t = from.getTime(); t <= to.getTime() + DAY; t += DAY) { const b = bucketOf(new Date(Math.min(t, to.getTime())), gran); if (!seen.has(b)) { seen.add(b); out.push(b); } } return out; }
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);
const money = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-AR');
const r0 = (n) => Math.round(Number(n) || 0);
const r1 = (n) => Math.round((Number(n) || 0) * 10) / 10;

const _cache = new Map(); // key → { at, value } (2 min; multi-instancia: cada proceso tiene la suya)
async function analyze(models, opts) {
  const key = JSON.stringify([opts.from, opts.to, opts.granularity, opts.campaign, opts.spend]);
  const c = _cache.get(key); if (c && Date.now() - c.at < 120000) return c.value;
  const value = await _analyze(models, opts);
  _cache.set(key, { at: Date.now(), value }); if (_cache.size > 50) _cache.delete(_cache.keys().next().value);
  return value;
}

async function _analyze(models, opts) {
  const { Transaction, User, RefundClaim, DailyRouletteSpin, Message, AppSession } = models;
  const from = new Date(opts.from); from.setUTCHours(3, 0, 0, 0);
  const to = new Date(opts.to); to.setUTCHours(27, 0, 0, 0); to.setTime(to.getTime() - 1);
  const gran = ['day', 'week', 'month'].includes(opts.granularity) ? opts.granularity : 'day';
  const campaign = String(opts.campaign || '').toUpperCase().trim();
  const spend = Number(opts.spend) || 0;
  const spendByDay = opts.spendByDay || {};
  const days = Math.max(1, Math.round((to - from) / DAY));
  const now = new Date();
  const T = {}; let _tk = Date.now(); const lap = (k) => { T[k] = Date.now() - _tk; _tk = Date.now(); };

  // Alcance por campaña → ids
  const userFilter = { role: 'user' }; if (campaign) userFilter.acquisitionCampaign = campaign;
  let scopeIds = null;
  if (campaign) scopeIds = (await User.find(userFilter).select('id').lean()).map((u) => u.id);
  const scope = (q) => (scopeIds ? { ...q, userId: { $in: scopeIds } } : q);
  const realDep = scope({ type: 'deposit', status: { $nin: ['failed', 'cancelled'] }, 'metadata.source': { $nin: GIFT_SOURCES } });
  const realWd = scope({ type: 'withdrawal', status: { $nin: ['failed', 'cancelled'] } });

  // (1) Por usuario, todo el histórico de cargas reales: primera, última, cantidad, monto — UNA agregación.
  const perUser = await Transaction.aggregate([{ $match: realDep }, { $group: { _id: '$userId', first: { $min: '$timestamp' }, last: { $max: '$timestamp' }, n: { $sum: 1 }, amt: { $sum: '$amount' } } }]).allowDiskUse(true);
  lap('perUser');
  const firstIn = (a, b) => perUser.filter((u) => u.first >= a && u.first <= b);
  const cohort = firstIn(from, to);
  const cohortIds = cohort.map((u) => u._id);
  // (2) Fechas de cargas de la cohorte (sólo esos usuarios) para retención y escalera.
  const cohortTx = cohortIds.length ? await Transaction.find({ ...realDep, userId: { $in: cohortIds } }).select('userId timestamp amount').sort({ timestamp: 1 }).lean() : [];
  lap('cohortTx');
  const datesBy = new Map(); cohortTx.forEach((t) => { if (!datesBy.has(t.userId)) datesBy.set(t.userId, []); datesBy.get(t.userId).push(new Date(t.timestamp)); });
  // (3) Movimientos del rango.
  const [depsR, wdsR, regs, logins, sessR, refundsR, spinsR, supportMsgs, promoAgg] = await Promise.all([
    Transaction.find({ ...realDep, timestamp: { $gte: from, $lte: to } }).select('userId amount timestamp').lean(),
    Transaction.find({ ...realWd, timestamp: { $gte: from, $lte: to } }).select('userId amount timestamp').lean(),
    User.find({ ...userFilter, createdAt: { $gte: from, $lte: to } }).select('id createdAt').lean(),
    User.find({ ...userFilter, lastLogin: { $gte: from, $lte: to } }).select('id lastLogin').lean(),
    AppSession.find(scope({ startedAt: { $gte: from, $lte: to } })).select('userId startedAt lastPingAt installed').lean(),
    RefundClaim.find(scope({ claimedAt: { $gte: from, $lte: to } })).select('userId amount claimedAt').lean(),
    DailyRouletteSpin.find(scope({ spunAt: { $gte: from, $lte: to } })).select('userId spunAt prizeARS').lean(),
    Message.countDocuments({ senderRole: 'user', timestamp: { $gte: from, $lte: to } }),
    Transaction.aggregate([{ $match: scope({ type: { $in: PROMO_TYPES }, status: { $nin: ['failed', 'cancelled'] }, timestamp: { $gte: from, $lte: to } }) }, { $group: { _id: '$type', n: { $sum: 1 }, amt: { $sum: '$amount' } } }])
  ]);
  lap('rango');
  const sum = (arr, f) => arr.reduce((s, x) => s + (Number(f ? f(x) : x) || 0), 0);
  const sessMin = (s) => Math.max(1, (new Date(s.lastPingAt) - new Date(s.startedAt)) / 60000);

  // Retención de la cohorte
  const lastLoginById = new Map(logins.map((u) => [u.id, new Date(u.lastLogin)]));
  const sessByUser = new Map(); sessR.forEach((s) => { if (!sessByUser.has(s.userId)) sessByUser.set(s.userId, []); sessByUser.get(s.userId).push(new Date(s.startedAt)); });
  const redep = (u, since, d) => (datesBy.get(u._id) || []).some((x) => x > since && x <= new Date(since.getTime() + d * DAY));
  const nextB = (u, since) => { const b = bucketOf(since, gran); return (datesBy.get(u._id) || []).some((x) => x > since && bucketOf(x, gran) !== b); };
  const back7 = (u, since) => { const lim = new Date(since.getTime() + 7 * DAY); const ll = lastLoginById.get(u._id); return (sessByUser.get(u._id) || []).some((x) => x > since && x <= lim) || (ll && ll > new Date(since.getTime() + 60000) && ll <= lim); };
  const retention = { cohort: cohort.length, d7: pct(cohort.filter((u) => redep(u, new Date(u.first), 7)).length, cohort.length), d30: pct(cohort.filter((u) => redep(u, new Date(u.first), 30)).length, cohort.length), next: pct(cohort.filter((u) => nextB(u, new Date(u.first))).length, cohort.length), login7: pct(cohort.filter((u) => back7(u, new Date(u.first))).length, cohort.length) };

  // Escalera después de la primera carga (todo lo que cargaron hasta hoy)
  const L = { una: 0, dosTres: 0, cuatroNueve: 0, diezMas: 0, activos14: 0, enDuda: 0, perdidos30: 0, cargas: 0, monto: 0 };
  cohort.forEach((u) => { L.cargas += u.n; L.monto += u.amt; if (u.n <= 1) L.una++; else if (u.n <= 3) L.dosTres++; else if (u.n <= 9) L.cuatroNueve++; else L.diezMas++; const ago = (now - new Date(u.last)) / DAY; if (ago <= 14) L.activos14++; else if (ago > 30) L.perdidos30++; else L.enDuda++; });
  const n = cohort.length;
  const repeat = { cohort: n, siguieronCargando: n - L.una, pctSiguieron: pct(n - L.una, n), una: L.una, pctUna: pct(L.una, n), dosTres: L.dosTres, pctDosTres: pct(L.dosTres, n), cuatroNueve: L.cuatroNueve, pctCuatroNueve: pct(L.cuatroNueve, n), diezMas: L.diezMas, pctDiezMas: pct(L.diezMas, n), activos14: L.activos14, pctActivos14: pct(L.activos14, n), enDuda: L.enDuda, perdidos30: L.perdidos30, pctPerdidos30: pct(L.perdidos30, n), cargasPorCliente: n ? r1(L.cargas / n) : null, montoPorCliente: n ? r0(L.monto / n) : null };

  // Abandono de toda la base del alcance
  const churn30 = pct(perUser.filter((u) => new Date(u.last) < new Date(to.getTime() - 30 * DAY)).length, perUser.length);

  // Serie por bucket
  const buckets = listBuckets(from, to, gran);
  const row = () => ({ registros: 0, primerasCargas: 0, cargas: 0, montoCargas: 0, cargadores: new Set(), retiros: 0, montoRetiros: 0, sesiones: 0, usuariosApp: new Set(), minutos: 0, reembolsos: 0, montoReembolsos: 0, giros: 0, premiosRuleta: 0 });
  const series = {}; buckets.forEach((b) => { series[b] = row(); });
  const get = (d) => { const b = bucketOf(d, gran); if (!series[b]) series[b] = row(); return series[b]; };
  regs.forEach((u) => { get(u.createdAt).registros++; });
  cohort.forEach((u) => { get(u.first).primerasCargas++; });
  depsR.forEach((t) => { const r = get(t.timestamp); r.cargas++; r.montoCargas += Number(t.amount) || 0; r.cargadores.add(t.userId); });
  wdsR.forEach((t) => { const r = get(t.timestamp); r.retiros++; r.montoRetiros += Number(t.amount) || 0; });
  sessR.forEach((s) => { const r = get(s.startedAt); r.sesiones++; r.usuariosApp.add(s.userId); r.minutos += sessMin(s); });
  logins.forEach((u) => { get(u.lastLogin).usuariosApp.add(u.id); });
  refundsR.forEach((c) => { const r = get(c.claimedAt); r.reembolsos++; r.montoReembolsos += Number(c.amount) || 0; });
  spinsR.forEach((s) => { const r = get(s.spunAt); r.giros++; r.premiosRuleta += Number(s.prizeARS) || 0; });
  const spendOf = {}; Object.keys(spendByDay).forEach((k) => { const bb = bucketOf(new Date(k + 'T12:00:00Z'), gran); spendOf[bb] = (spendOf[bb] || 0) + spendByDay[k]; });
  const rows = Object.keys(series).sort().map((b) => { const r = series[b]; return { bucket: b, gasto: r0(spendOf[b] || 0), costoPorNuevo: spendOf[b] > 0 && r.primerasCargas ? r0(spendOf[b] / r.primerasCargas) : null, registros: r.registros, primerasCargas: r.primerasCargas, cargas: r.cargas, montoCargas: r0(r.montoCargas), cargadores: r.cargadores.size, retiros: r.retiros, montoRetiros: r0(r.montoRetiros), netwin: r0(r.montoCargas - r.montoRetiros), sesiones: r.sesiones, usuariosApp: r.usuariosApp.size, minPorSesion: r.sesiones ? r1(r.minutos / r.sesiones) : null, reembolsos: r.reembolsos, montoReembolsos: r0(r.montoReembolsos), giros: r.giros, premiosRuleta: r0(r.premiosRuleta) }; });

  lap('series');
  // Totales
  const depositors = new Set(depsR.map((t) => t.userId));
  const appUsers = new Set([...sessR.map((s) => s.userId), ...logins.map((u) => u.id)]);
  const newIds = new Set(cohortIds);
  const montoCargas = sum(depsR, (t) => t.amount), montoRetiros = sum(wdsR, (t) => t.amount);
  const nwNew = sum(depsR.filter((t) => newIds.has(t.userId)), (t) => t.amount) - sum(wdsR.filter((t) => newIds.has(t.userId)), (t) => t.amount);
  const totals = {
    dias: days, registros: regs.length, primerasCargas: n, conversionRegistroCarga: pct(n, regs.length),
    cargas: depsR.length, montoCargas: r0(montoCargas), cargadores: depositors.size, cargasPorCargador: depositors.size ? r1(depsR.length / depositors.size) : null, cargaPromedio: depsR.length ? r0(montoCargas / depsR.length) : null,
    retiros: wdsR.length, montoRetiros: r0(montoRetiros), netwin: r0(montoCargas - montoRetiros),
    usuariosApp: appUsers.size, sesiones: sessR.length, minPorSesion: sessR.length ? r1(sum(sessR, sessMin) / sessR.length) : null, sesionesPorUsuarioDia: appUsers.size ? Math.round(sessR.length / appUsers.size / days * 100) / 100 : null, instalados: new Set(sessR.filter((s) => s.installed).map((s) => s.userId)).size,
    reembolsos: refundsR.length, montoReembolsos: r0(sum(refundsR, (x) => x.amount)), giros: spinsR.length, premiosRuleta: r0(sum(spinsR, (x) => x.prizeARS)), mensajesSoporte: supportMsgs,
    promos: Object.fromEntries((promoAgg || []).map((p) => [p._id, { n: p.n, amt: r0(p.amt) }])), promosTotal: r0((promoAgg || []).reduce((s, p) => s + (Number(p.amt) || 0), 0)),
    churn30, spend, gastoPorDia: spend > 0 ? r0(spend / days) : 0, cac: spend > 0 && n ? r0(spend / n) : null, netwinNuevos: r0(nwNew), netwinPorNuevo: n ? r0(nwNew / n) : null, baseCargadores: perUser.length
  };
  totals.promosPct = pct(totals.promosTotal, totals.montoCargas); totals.netwinNeto = r0(totals.netwin - totals.promosTotal); // #469
  // Período anterior (misma longitud)
  const prevTo = new Date(from.getTime() - 1), prevFrom = new Date(from.getTime() - (to - from) - 1);
  const [prevRegs, prevDepAgg] = await Promise.all([
    User.countDocuments({ ...userFilter, createdAt: { $gte: prevFrom, $lte: prevTo } }),
    Transaction.aggregate([{ $match: { ...realDep, timestamp: { $gte: prevFrom, $lte: prevTo } } }, { $group: { _id: null, n: { $sum: 1 }, amt: { $sum: '$amount' } } }])
  ]);
  const prevFirst = firstIn(prevFrom, prevTo).length; const prevAmt = (prevDepAgg[0] && prevDepAgg[0].amt) || 0;
  const growth = { primerasCargas: pct(n - prevFirst, prevFirst), registros: pct(regs.length - prevRegs, prevRegs), montoCargas: pct(montoCargas - prevAmt, prevAmt), prev: { primerasCargas: prevFirst, registros: prevRegs, montoCargas: r0(prevAmt) } };

  lap('prev');
  T.counts = { perUser: perUser.length, cohort: cohort.length, cohortTx: cohortTx.length, depsR: depsR.length, wdsR: wdsR.length, regs: regs.length, logins: logins.length, sess: sessR.length };
  return { from: dateKeyART(from), to: dateKeyART(to), granularity: gran, campaign: campaign || null, totals, retention, repeat, growth, rows, promoConfig: opts.promoConfig || null, informe: narrative(totals, retention, growth, gran, repeat, opts.promoConfig || null), calculadoEn: now.toISOString(), timings: T };
}

function grade(v, good, ok) { if (v == null) return null; return v >= good ? 'bien' : (v >= ok ? 'regular' : 'flojo'); }
function narrative(t, r, g, gran, rp, pc) {
  const L = []; const per = gran === 'month' ? 'mes' : (gran === 'week' ? 'semana' : 'día');
  const sec = (ico, titulo, texto, estado, consejo) => L.push({ ico, titulo, texto, estado: estado || null, consejo: consejo || null });
  // Captación
  const conv = t.conversionRegistroCarga;
  sec('📥', 'Captación', `${t.registros} registros y ${t.primerasCargas} clientes que cargaron por primera vez en ${t.dias} día(s)` + (conv != null ? ` (${conv}% de los registrados llegó a cargar)` : '') + (g.primerasCargas != null ? `. Contra el período anterior: primeras cargas ${g.primerasCargas >= 0 ? '+' : ''}${g.primerasCargas}% (antes ${g.prev.primerasCargas}), registros ${g.registros >= 0 ? '+' : ''}${g.registros}%.` : '.'),
    grade(conv, 35, 20), conv == null ? null : (conv >= 35 ? 'La conversión registro → carga es buena.' : (conv >= 20 ? 'Muchos se registran y no cargan: revisar el primer mensaje, la carga mínima y la claridad del CBU.' : 'La mayoría entra y no carga: trabajar el primer contacto (soporte, bono de bienvenida, claridad del CBU).')));
  // Retención
  if (r.cohort) {
    const gd = grade(r.d30, 40, 20);
    sec('🔁', 'Retención', `De los ${r.cohort} que cargaron por primera vez: volvió a cargar a los 7 días el ${r.d7 ?? 0}%, a los 30 días el ${r.d30 ?? 0}% y en el ${per} siguiente el ${r.next ?? 0}%. Volvió a ENTRAR a la app en la primera semana el ${r.login7 ?? 0}%.`, gd,
      gd === 'bien' ? 'El producto gusta: la gente vuelve a cargar.' : (gd === 'regular' ? 'Vuelve una parte: empujar con reembolsos, fueguito y avisos a los que no vuelven.' : 'La mayoría carga una vez y no vuelve: antes de invertir más, revisar la experiencia después de la primera carga.') + (r.login7 != null && r.d7 != null && r.login7 - r.d7 >= 25 ? ' Muchos vuelven a ENTRAR pero no a CARGAR: falta un motivo para la segunda carga (bono en la 2ª carga, recordatorio).' : ''));
  } else sec('🔁', 'Retención', 'No hubo primeras cargas en el rango: no se puede medir.', null, null);
  // Escalera
  if (rp && rp.cohort) sec('🪜', 'Después de la primera carga', `De los ${rp.cohort} nuevos del rango (contando todo lo que cargaron hasta hoy): ${rp.siguieronCargando} siguieron cargando (${rp.pctSiguieron}%) y ${rp.una} se quedaron en una sola carga (${rp.pctUna}%). 2-3 cargas: ${rp.dosTres} (${rp.pctDosTres}%) · 4-9: ${rp.cuatroNueve} (${rp.pctCuatroNueve}%) · 10 o más: ${rp.diezMas} (${rp.pctDiezMas}%). Hoy siguen activos (cargaron en los últimos 14 días) ${rp.activos14} (${rp.pctActivos14}%); perdidos (más de 30 días sin cargar) ${rp.perdidos30} (${rp.pctPerdidos30}%). Cada nuevo dejó en promedio ${rp.cargasPorCliente} cargas y ${money(rp.montoPorCliente)}.`,
    grade(rp.pctSiguieron, 50, 30), rp.pctSiguieron >= 50 ? 'Quedan muchos: más de la mitad vuelve a cargar. Base sana.' : (rp.pctSiguieron >= 30 ? 'Se pierde una parte importante en el camino: entre 3 y 5 de cada 10 siguen. Trabajar la segunda carga.' : 'Se pierde la mayoría: menos de 3 de cada 10 vuelven. El problema no es traer gente sino retenerla.'));
  if (t.churn30 != null) sec('📉', 'Abandono', `El ${t.churn30}% de los ${t.baseCargadores} que alguna vez cargaron no carga hace más de 30 días.`, t.churn30 >= 70 ? 'flojo' : (t.churn30 >= 45 ? 'regular' : 'bien'), t.churn30 >= 70 ? 'Alto: la base se enfría. Campañas de recuperación.' : (t.churn30 >= 45 ? 'Normal para el rubro; vale un lote de recuperación.' : 'Bajo: la base está activa.'));
  // Uso
  if (t.sesiones) sec('📱', 'Uso de la app', `${t.usuariosApp} usuarios entraron, ${t.sesiones} sesiones, ${t.minPorSesion} min por sesión en promedio, ${t.sesionesPorUsuarioDia} sesiones por usuario por día; ${t.instalados} usaron la app instalada.`, t.minPorSesion >= 4 ? 'bien' : (t.minPorSesion >= 2 ? 'regular' : 'flojo'), t.minPorSesion >= 4 ? 'Se quedan un buen rato: la app engancha.' : (t.minPorSesion >= 2 ? 'Visitas cortas: entran, hacen lo suyo y salen (normal si vienen a cargar).' : 'Visitas muy cortas: revisar si encuentran lo que buscan.'));
  else sec('📱', 'Uso de la app', `${t.usuariosApp} usuarios entraron. Sin medición de tiempo en sesión todavía (el medidor arranca con la versión nueva de la app).`, null, null);
  // Dinero
  sec('💰', 'Dinero', `${t.cargas} cargas por ${money(t.montoCargas)} (${t.cargadores} cargadores, ${t.cargasPorCargador ?? 0} cargas por cargador, promedio ${money(t.cargaPromedio)}), ${t.retiros} retiros por ${money(t.montoRetiros)}. NETWIN: ${money(t.netwin)}. Reembolsos pagados: ${money(t.montoReembolsos)} (${t.reembolsos}); ruleta: ${t.giros} giros, ${money(t.premiosRuleta)} en premios.`,
    t.cargasPorCargador == null ? null : (t.cargasPorCargador >= 3 ? 'bien' : (t.cargasPorCargador >= 1.8 ? 'regular' : 'flojo')), t.cargasPorCargador == null ? null : (t.cargasPorCargador >= 3 ? 'Frecuencia de carga alta: los que cargan, repiten.' : (t.cargasPorCargador >= 1.8 ? 'Frecuencia de carga media.' : 'Frecuencia baja: la mayoría carga una sola vez en el período.')));
  // #469 Promociones vigentes + costo real
  {
    const vig = pc ? [pc.firstDepositBonusPct > 0 ? `${pc.firstDepositBonusPct}% en la PRIMERA carga` : null, pc.autoLoadBonusPct > 0 ? `${pc.autoLoadBonusPct}% en cargas automáticas` : null, pc.dailyRefundPct > 0 ? `reembolso diario ${pc.dailyRefundPct}%` : null, pc.weeklyRefundPct > 0 ? `semanal ${pc.weeklyRefundPct}%` : null, pc.monthlyRefundPct > 0 ? `mensual ${pc.monthlyRefundPct}%` : null, pc.installGiftPct > 0 ? `${pc.installGiftPct}% extra por instalar la app` : null].filter(Boolean).join(' · ') : null;
    const det = Object.keys(t.promos || {}).map((k) => `${PROMO_LABEL[k] || k} ${money(t.promos[k].amt)}`).join(' · ');
    sec('🎁', 'Promociones (lo que regalás hoy)', (vig ? `Condiciones vigentes: ${vig}. ` : '') + `En el período las promociones costaron ${money(t.promosTotal)} = ${t.promosPct ?? 0}% de lo cargado` + (det ? ` (${det})` : '') + `. NETWIN neto de promociones: ${money(t.netwinNeto)}.`,
      t.promosPct == null ? null : (t.promosPct <= 15 ? 'bien' : (t.promosPct <= 30 ? 'regular' : 'flojo')),
      t.promosPct == null ? null : (t.promosPct <= 15 ? 'Las promociones pesan poco sobre lo cargado.' : (t.promosPct <= 30 ? 'Las promociones pesan bastante: es el precio de captar; cuando el bono de primera carga ya pasó, los clientes que quedan dejan más margen.' : 'Las promociones se comen gran parte del margen: revisar el % de primera carga y los reembolsos.')));
  }
  // Inversión
  if (t.spend > 0) sec('📣', 'Inversión', `${money(t.spend)} gastados en el período (${money(t.gastoPorDia)} por día) → costo por cliente nuevo (primera carga): ${t.cac != null ? money(t.cac) : '—'}. Los ${t.primerasCargas} nuevos dejaron ${money(t.netwinNuevos)} de netwin en el período (${money(t.netwinPorNuevo)} por cliente).`,
    t.cac != null && t.netwinPorNuevo != null ? (t.netwinPorNuevo >= t.cac * 1.3 ? 'bien' : (t.netwinPorNuevo >= t.cac * 0.8 ? 'regular' : 'flojo')) : null,
    t.cac != null && t.netwinPorNuevo != null ? (t.netwinPorNuevo >= t.cac * 1.3 ? 'La inversión RINDE: cada cliente nuevo deja más de lo que costó traerlo, ya dentro del período.' : (t.netwinPorNuevo >= t.cac * 0.8 ? 'Al límite: el cliente nuevo paga casi lo que costó; depende de que vuelva a cargar.' : 'No se recupera en el período: cada cliente nuevo cuesta más de lo que deja. Si la retención es buena puede cerrar después; si no, bajar el gasto o cambiar la pauta.')) : null);
  else sec('📣', 'Inversión', 'Cargá el gasto en publicidad del período para calcular el costo por cliente nuevo y si se recupera.', null, null);
  sec('💬', 'Soporte', `${t.mensajesSoporte} mensajes de clientes en el período.`, null, null);
  // Veredicto
  const score = L.map((x) => x.estado).filter(Boolean); const good = score.filter((x) => x === 'bien').length, bad = score.filter((x) => x === 'flojo').length;
  const veredicto = !score.length ? { nivel: 'sin-datos', texto: 'Todavía no hay datos suficientes en este rango.' } : (good > bad && bad <= 1 ? { nivel: 'bien', texto: 'El negocio está sano: la gente carga, vuelve y repite. Vale invertir más.' } : (bad >= 2 && bad >= good ? { nivel: 'flojo', texto: 'Hay señales de alarma (conversión, retención o frecuencia flojas). Antes de escalar la pauta, ajustar producto y seguimiento.' } : { nivel: 'regular', texto: 'Va, pero con puntos a mejorar: mantener la inversión y corregir lo marcado.' }));
  return { secciones: L, veredicto, resumen: { bien: good, regular: score.filter((x) => x === 'regular').length, flojo: bad } };
}

function compare(ours, other) {
  const dOther = Math.max(1, Math.round((new Date(other.to) - new Date(other.from)) / DAY) + 1), oursDays = ours.totals.dias;
  const rows = [];
  const add = (key, label, o, t, isMoney) => {
    const tv = (t == null || t === '') ? null : Number(t); const od = o == null ? null : Math.round((o / oursDays) * 100) / 100, td = tv == null ? null : Math.round((tv / dOther) * 100) / 100;
    const diff = od != null && td != null && td > 0 ? Math.round(((od - td) / td) * 1000) / 10 : null;
    rows.push({ key, label, ours: o, oursPerDay: od, other: tv, otherPerDay: td, diffPct: diff, better: diff != null && diff > 5, worse: diff != null && diff < -5, isMoney: !!isMoney });
  };
  add('firstDeposits', 'Clientes que cargaron por primera vez', ours.totals.primerasCargas, other.firstDeposits);
  add('usersEntered', 'Usuarios que entraron a la app', ours.totals.usuariosApp, other.usersEntered);
  add('deposits', 'Cantidad de depósitos', ours.totals.cargas, other.deposits);
  add('depositsSum', 'Monto depositado', ours.totals.montoCargas, other.depositsSum, true);
  const direct = (key, label, o, t) => { const tv = (t == null || t === '') ? null : Number(t); const diff = o != null && tv != null && tv > 0 ? Math.round(((o - tv) / tv) * 1000) / 10 : null; rows.push({ key, label, ours: o, other: tv, diffPct: diff, better: diff != null && diff > 5, worse: diff != null && diff < -5, direct: true }); };
  if (other.avgSessionMin != null && other.avgSessionMin !== '') direct('avgSessionMin', 'Minutos por sesión (medidor)', ours.totals.minPorSesion, other.avgSessionMin);
  if (other.retentionPct != null && other.retentionPct !== '') direct('retention', 'Retención a 30 días (volvió a cargar, %)', ours.retention.d30, other.retentionPct);
  const b = rows.filter((r) => r.better).length, w = rows.filter((r) => r.worse).length, nn = rows.filter((r) => r.diffPct != null).length;
  const verdict = !nn ? 'Faltan números de la otra página para comparar.' : (b > w ? `La app nueva va MEJOR en ${b} de ${nn} indicadores (comparando por día).` : (w > b ? `La app nueva va PEOR en ${w} de ${nn} indicadores (comparando por día).` : 'Parejas: sin diferencias claras por día.'));
  return { otherLabel: other.label || 'Otra página', otherDays: dOther, oursDays, rows, verdict, nivel: !nn ? 'sin-datos' : (b > w ? 'bien' : (w > b ? 'flojo' : 'regular')) };
}

// Calculador de inversión. `calibration` = factor real/proyectado promedio de revisiones anteriores (1 = sin ajuste).
// #464: economía POR CLIENTE (netwin que deja un cliente nuevo) × clientes por pauta (inversión / costo por cliente). Lo orgánico
// se muestra aparte y NO entra en el ROI. Si en la base no hay gasto cargado, el ritmo actual se asume mixto: `organicPct`
// (default 30%) es orgánico y el resto venía de pauta (supuesto que se ve y se puede cambiar).
function project(base, opts) {
  const spend = Math.max(0, Number(opts.spend) || 0), days = Math.max(1, Math.min(365, parseInt(opts.days, 10) || 30));
  const t = base.totals, rp = base.repeat, baseDays = Math.max(1, t.dias);
  const calib = Number(opts.calibration) > 0 ? Number(opts.calibration) : 1;
  const cac = Number(opts.cac) > 0 ? Number(opts.cac) : (t.cac || null);
  const organicPct = Number(opts.organicPct) >= 0 && Number(opts.organicPct) <= 100 ? Number(opts.organicPct) / 100 : 0.3;
  const perDayFirst = t.primerasCargas / baseDays;
  let organicPerDay;
  if (t.spend > 0 && cac) organicPerDay = Math.max(0, perDayFirst - (t.spend / baseDays) / cac); // base con gasto: lo que no explica la pauta
  else organicPerDay = perDayFirst * organicPct;
  const cargasPorCliente = rp.cargasPorCliente || t.cargasPorCargador || 1;
  const montoPorCliente = rp.montoPorCliente || t.cargaPromedio || 0;
  const wdRatio = t.montoCargas > 0 ? Math.min(0.95, t.montoRetiros / t.montoCargas) : 0.5;
  const reembPct = t.montoCargas > 0 ? t.montoReembolsos / t.montoCargas : 0;
  const activePct = (rp.pctActivos14 != null ? rp.pctActivos14 : 30) / 100;
  const horizon = Math.min(1.5, Math.max(0.5, days / 30));
  // #469: promociones — lo observado (promos / cargado en la base) escalado por las condiciones FUTURAS vs las vigentes
  const pc = opts.promoConfig || {}; const promoNowPct = t.montoCargas > 0 ? (t.promosTotal || 0) / t.montoCargas : 0;
  const curLevel = (Number(pc.firstDepositBonusPct) || 0) + (Number(pc.dailyRefundPct) || 0);
  const futBonus = (opts.futBonus !== '' && opts.futBonus != null && Number(opts.futBonus) >= 0) ? Number(opts.futBonus) : (Number(pc.firstDepositBonusPct) || 0);
  const futRefund = (opts.futRefund !== '' && opts.futRefund != null && Number(opts.futRefund) >= 0) ? Number(opts.futRefund) : (Number(pc.dailyRefundPct) || 0);
  const promoRatio = curLevel > 0 ? Math.max(0, (futBonus + futRefund) / curLevel) : 1;
  const promoFutPct = promoNowPct * promoRatio;
  const netwinPorCliente = montoPorCliente * horizon * (1 - wdRatio - reembPct);
  const mk = (f) => {
    const ff = f * calib;
    const porPauta = cac ? (spend / cac) * ff : 0, organicos = organicPerDay * days * ff, nuevos = porPauta + organicos;
    const monto = nuevos * montoPorCliente * horizon, retiros = monto * wdRatio, reemb = monto * reembPct, netwin = monto - retiros - reemb;
    const netwinPauta = porPauta * netwinPorCliente;
    const promos = monto * promoFutPct, promosPauta = (porPauta * montoPorCliente * horizon) * promoFutPct;
    const netwinNeto = netwin - promos, netwinPautaNeto = netwinPauta - promosPauta;
    return { clientesPorPauta: r0(porPauta), clientesOrganicos: r0(organicos), clientesNuevos: r0(nuevos), cargas: r0(nuevos * cargasPorCliente), montoCargas: r0(monto), retiros: r0(retiros), reembolsos: r0(reemb), netwin: r0(netwin), promos: r0(promos), netwinNeto: r0(netwinNeto), netwinPauta: r0(netwinPauta), netwinPautaNeto: r0(netwinPautaNeto), netwinOrganico: r0(netwin - netwinPauta), activosAlFinal: r0(nuevos * activePct), resultado: r0(netwinPautaNeto - spend), roi: spend > 0 ? Math.round(((netwinPautaNeto - spend) / spend) * 100) : null, recuperaEnDias: cac && netwinPorCliente * (1 - promoFutPct) > 0 ? Math.min(999, r0(cac / ((netwinPorCliente * (1 - promoFutPct)) / days))) : null };
  };
  // #467: "Hoy, como está": lo que pasa por día con el gasto actual, para comparar contra la inversión extra.
  const hoy = { gastoPorDia: r0((t.spend || 0) / baseDays), nuevosPorDia: Math.round(perDayFirst * 10) / 10, cargasPorDia: r0(t.cargas / baseDays), montoPorDia: r0(t.montoCargas / baseDays), netwinPorDia: r0(t.netwin / baseDays), costoPorNuevo: t.cac || null, enDias: { dias: days, gasto: r0((t.spend || 0) / baseDays * days), nuevos: r0(perDayFirst * days), monto: r0(t.montoCargas / baseDays * days), netwin: r0(t.netwin / baseDays * days) } };
  return { spend, days, calibration: calib, hoy, promo: { promoNowPct: Math.round(promoNowPct * 1000) / 10, curBonus: Number(pc.firstDepositBonusPct) || 0, curRefund: Number(pc.dailyRefundPct) || 0, futBonus, futRefund, promoRatio: Math.round(promoRatio * 100) / 100, promoFutPct: Math.round(promoFutPct * 1000) / 10 }, supuestos: { diasBase: baseDays, baseDesde: base.from, baseHasta: base.to, cac, cacOrigen: Number(opts.cac) > 0 ? 'indicado' : (t.cac ? 'observado' : 'sin dato'), primerasCargasPorDia: Math.round(perDayFirst * 100) / 100, organicasPorDia: Math.round(organicPerDay * 100) / 100, organicPct: t.spend > 0 && cac ? null : Math.round(organicPct * 100), cargasPorCliente, montoPorCliente: r0(montoPorCliente), netwinPorCliente: r0(netwinPorCliente), pctRetirado: Math.round(wdRatio * 100), pctReembolsos: Math.round(reembPct * 100), pctActivos: Math.round(activePct * 100), gastoBase: t.spend || 0 }, bajo: mk(0.7), base: mk(1), alto: mk(1.3), nota: cac ? null : 'No hay costo por cliente nuevo: cargá el gasto en publicidad de un período con pauta (Análisis → Gasto) o indicá el costo a mano. Mientras tanto sólo se proyecta lo orgánico.' };
}

// Revisión de una proyección contra lo REAL: `real` = analyze() del tramo transcurrido. Prorratea lo proyectado a los días
// transcurridos y devuelve el factor real/proyectado por indicador y el global (clientes nuevos y netwin pesan más).
function review(snapshot, real, elapsedDays) {
  const p = snapshot.result && snapshot.result.base; if (!p) return null;
  const frac = Math.max(0.05, Math.min(1, elapsedDays / snapshot.params.days));
  const rows = [['clientesNuevos', 'Clientes nuevos', p.clientesNuevos * frac, real.totals.primerasCargas], ['cargas', 'Cargas', p.cargas * frac, real.totals.cargas], ['montoCargas', 'Monto cargado', p.montoCargas * frac, real.totals.montoCargas, true], ['netwin', 'NETWIN', p.netwin * frac, real.totals.netwin, true], ['activosAlFinal', 'Clientes activos', p.activosAlFinal * frac, real.repeat.activos14]]
    .map(([key, label, proj, rl, isMoney]) => ({ key, label, proyectado: r0(proj), real: r0(rl), diffPct: proj > 0 ? Math.round(((rl - proj) / proj) * 1000) / 10 : null, factor: proj > 0 ? Math.round((rl / proj) * 100) / 100 : null, isMoney: !!isMoney }));
  const w = { clientesNuevos: 2, netwin: 2, cargas: 1, montoCargas: 1, activosAlFinal: 1 };
  const fs = rows.filter((r) => r.factor != null && isFinite(r.factor)); const factor = fs.length ? Math.round((fs.reduce((s, r) => s + r.factor * w[r.key], 0) / fs.reduce((s, r) => s + w[r.key], 0)) * 100) / 100 : null;
  return { reviewedAt: new Date().toISOString(), elapsedDays, fraction: Math.round(frac * 100), rows, factor: factor != null ? Math.max(0.2, Math.min(3, factor)) : null, lectura: factor == null ? 'Sin datos reales todavía.' : (factor >= 0.9 && factor <= 1.1 ? 'La proyección estuvo bien calibrada.' : (factor > 1.1 ? `La realidad superó lo proyectado (×${factor}): las próximas proyecciones se ajustan hacia arriba.` : `La realidad quedó por debajo de lo proyectado (×${factor}): las próximas proyecciones se ajustan hacia abajo.`)) };
}

module.exports = { analyze, compare, project, review, dateKeyART };
