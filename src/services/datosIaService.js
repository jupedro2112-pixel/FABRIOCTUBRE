// #459 (owner 2026-10-18): DATOS IA — análisis del negocio a partir de los datos recolectados (sin IA externa): registros,
// primeras cargas, cargas/retiros, retención (vuelve a cargar a 7/30 días y en el período siguiente; vuelve a entrar), uso de
// la app (sesiones, duración, aperturas), reembolsos, ruleta, soporte, inversión (gasto cargado a mano) y un informe escrito
// por reglas. Todo por día / semana / mes y filtrable por campaña de origen. Además, comparativa contra "la otra página"
// (números cargados a mano). Hora argentina para los cortes.
'use strict';
const TZ = 'America/Argentina/Buenos_Aires';
const GIFT_SOURCES = ['install_bonus', 'welcome_gift', 'payout_refund'];

function dateKeyART(d) { return new Date(d).toLocaleDateString('en-CA', { timeZone: TZ }); }
function bucketOf(d, gran) {
  const k = dateKeyART(d); // YYYY-MM-DD
  if (gran === 'month') return k.slice(0, 7);
  if (gran === 'week') { // lunes de esa semana (ART)
    const [y, m, dd] = k.split('-').map(Number); const dt = new Date(Date.UTC(y, m - 1, dd));
    const wd = (dt.getUTCDay() + 6) % 7; dt.setUTCDate(dt.getUTCDate() - wd);
    return dt.toISOString().slice(0, 10);
  }
  return k;
}
function listBuckets(from, to, gran) {
  const out = []; const seen = new Set();
  for (let t = from.getTime(); t <= to.getTime(); t += 86400000) { const b = bucketOf(new Date(t), gran); if (!seen.has(b)) { seen.add(b); out.push(b); } }
  const last = bucketOf(to, gran); if (!seen.has(last)) out.push(last);
  return out;
}
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);
const sum = (arr) => arr.reduce((s, x) => s + (Number(x) || 0), 0);
const money = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-AR');

async function analyze(models, opts) {
  const { Transaction, User, RefundClaim, DailyRouletteSpin, Message, AppSession } = models;
  const from = new Date(opts.from); from.setUTCHours(3, 0, 0, 0); // 00:00 ART ≈ 03:00Z
  const to = new Date(opts.to); to.setUTCHours(3 + 24, 0, 0, 0); to.setMilliseconds(-1);
  const gran = ['day', 'week', 'month'].includes(opts.granularity) ? opts.granularity : 'day';
  const campaign = (opts.campaign || '').toUpperCase().trim();
  const spend = Number(opts.spend) || 0;

  // Usuarios del alcance (por campaña si se pidió)
  const userFilter = { role: 'user' };
  if (campaign) userFilter.acquisitionCampaign = campaign;
  const scopedUsers = campaign ? await User.find(userFilter).select('id').lean() : null;
  const scopedIds = scopedUsers ? new Set(scopedUsers.map((u) => u.id)) : null;
  const inScope = (uid) => !scopedIds || scopedIds.has(uid);

  // Depósitos reales y retiros (todo el histórico de los usuarios del alcance → primera carga + retención)
  const txAll = await Transaction.find({ type: { $in: ['deposit', 'withdrawal'] }, status: { $nin: ['failed', 'cancelled'] }, 'metadata.source': { $nin: GIFT_SOURCES } })
    .select('type amount timestamp userId username').sort({ timestamp: 1 }).lean();
  const deps = txAll.filter((t) => t.type === 'deposit' && inScope(t.userId));
  const wds = txAll.filter((t) => t.type === 'withdrawal' && inScope(t.userId));
  const firstDepAt = new Map(); // userId → fecha de la primera carga
  for (const d of deps) if (!firstDepAt.has(d.userId)) firstDepAt.set(d.userId, new Date(d.timestamp));
  const depsByUser = new Map(); for (const d of deps) { if (!depsByUser.has(d.userId)) depsByUser.set(d.userId, []); depsByUser.get(d.userId).push(new Date(d.timestamp)); }

  const inRange = (d) => d >= from && d <= to;
  const depsR = deps.filter((d) => inRange(new Date(d.timestamp)));
  const wdsR = wds.filter((d) => inRange(new Date(d.timestamp)));
  const regs = await User.find({ ...userFilter, createdAt: { $gte: from, $lte: to } }).select('id createdAt lastLogin acquisitionCampaign').lean();
  const logins = await User.find({ ...userFilter, lastLogin: { $gte: from, $lte: to } }).select('id lastLogin').lean();
  const sessions = await AppSession.find({ startedAt: { $gte: from, $lte: to } }).select('userId startedAt lastPingAt installed').lean();
  const sessR = sessions.filter((s) => inScope(s.userId));
  const refunds = await RefundClaim.find({ claimedAt: { $gte: from, $lte: to } }).select('userId amount claimedAt').lean();
  const refundsR = refunds.filter((r) => inScope(r.userId));
  const spins = await DailyRouletteSpin.find({ spunAt: { $gte: from, $lte: to } }).select('userId spunAt prizeARS').lean();
  const spinsR = spins.filter((s) => inScope(s.userId));
  const supportMsgs = await Message.countDocuments({ senderRole: 'user', timestamp: { $gte: from, $lte: to } });

  // Cohorte: primeras cargas en el rango
  const firstInRange = [...firstDepAt.entries()].filter(([, d]) => inRange(d));
  const lastLoginById = new Map(logins.map((u) => [u.id, new Date(u.lastLogin)]));
  const sessUsersAfter = (uid, since, days) => sessR.some((s) => s.userId === uid && s.startedAt > since && s.startedAt <= new Date(since.getTime() + days * 86400000));
  const redep = (uid, since, days) => (depsByUser.get(uid) || []).some((d) => d > since && d <= new Date(since.getTime() + days * 86400000));
  const nextBucketRedep = (uid, since) => { const b = bucketOf(since, gran); return (depsByUser.get(uid) || []).some((d) => d > since && bucketOf(d, gran) !== b); };
  const ret = {
    cohort: firstInRange.length,
    d7: pct(firstInRange.filter(([u, d]) => redep(u, d, 7)).length, firstInRange.length),
    d30: pct(firstInRange.filter(([u, d]) => redep(u, d, 30)).length, firstInRange.length),
    next: pct(firstInRange.filter(([u, d]) => nextBucketRedep(u, d)).length, firstInRange.length),
    login7: pct(firstInRange.filter(([u, d]) => sessUsersAfter(u, d, 7) || (lastLoginById.get(u) && lastLoginById.get(u) > new Date(d.getTime() + 60000) && lastLoginById.get(u) <= new Date(d.getTime() + 7 * 86400000))).length, firstInRange.length)
  };
  // #459b (owner): "cuántos siguen cargando después de su primera carga y si se pierden la mayoría en el camino o quedan".
  // Escalera de la cohorte (primeras cargas del rango) con TODO lo que cargaron hasta hoy: 1 sola / 2-3 / 4-9 / 10+ cargas,
  // y cuántos siguen activos (cargaron en los últimos 14 días) vs perdidos (más de 30 días sin cargar).
  const now = new Date();
  const ladder = { total: firstInRange.length, una: 0, dosTres: 0, cuatroNueve: 0, diezMas: 0, activos14: 0, enDuda: 0, perdidos30: 0, cargasTotales: 0, montoTotal: 0 };
  firstInRange.forEach(([u]) => {
    const arr = depsByUser.get(u) || []; const n = arr.length; ladder.cargasTotales += n;
    ladder.montoTotal += sum(deps.filter((d) => d.userId === u).map((d) => d.amount));
    if (n <= 1) ladder.una++; else if (n <= 3) ladder.dosTres++; else if (n <= 9) ladder.cuatroNueve++; else ladder.diezMas++;
    const last = arr[arr.length - 1]; const ago = (now - last) / 86400000;
    if (ago <= 14) ladder.activos14++; else if (ago > 30) ladder.perdidos30++; else ladder.enDuda++;
  });
  const repeat = {
    cohort: ladder.total,
    siguieronCargando: ladder.total - ladder.una, pctSiguieron: pct(ladder.total - ladder.una, ladder.total),
    una: ladder.una, pctUna: pct(ladder.una, ladder.total), dosTres: ladder.dosTres, pctDosTres: pct(ladder.dosTres, ladder.total),
    cuatroNueve: ladder.cuatroNueve, pctCuatroNueve: pct(ladder.cuatroNueve, ladder.total), diezMas: ladder.diezMas, pctDiezMas: pct(ladder.diezMas, ladder.total),
    activos14: ladder.activos14, pctActivos14: pct(ladder.activos14, ladder.total), enDuda: ladder.enDuda, perdidos30: ladder.perdidos30, pctPerdidos30: pct(ladder.perdidos30, ladder.total),
    cargasPorCliente: ladder.total ? Math.round(ladder.cargasTotales / ladder.total * 10) / 10 : null, montoPorCliente: ladder.total ? Math.round(ladder.montoTotal / ladder.total) : null
  };
  // Churn: de todos los que alguna vez cargaron (alcance), cuántos no cargan hace +30 d respecto del fin del rango
  const everDep = [...depsByUser.keys()];
  const churn30 = pct(everDep.filter((u) => { const arr = depsByUser.get(u); const last = arr[arr.length - 1]; return last < new Date(to.getTime() - 30 * 86400000); }).length, everDep.length);

  // Series por bucket
  const buckets = listBuckets(from, to, gran);
  const row = () => ({ registros: 0, primerasCargas: 0, cargas: 0, montoCargas: 0, cargadores: new Set(), retiros: 0, montoRetiros: 0, sesiones: 0, usuariosApp: new Set(), minutos: 0, reembolsos: 0, montoReembolsos: 0, giros: 0, premiosRuleta: 0 });
  const series = Object.fromEntries(buckets.map((b) => [b, row()]));
  const get = (d) => series[bucketOf(d, gran)] || (series[bucketOf(d, gran)] = row());
  regs.forEach((u) => { get(u.createdAt).registros++; });
  firstInRange.forEach(([, d]) => { get(d).primerasCargas++; });
  depsR.forEach((t) => { const r = get(t.timestamp); r.cargas++; r.montoCargas += Number(t.amount) || 0; r.cargadores.add(t.userId); });
  wdsR.forEach((t) => { const r = get(t.timestamp); r.retiros++; r.montoRetiros += Number(t.amount) || 0; });
  sessR.forEach((s) => { const r = get(s.startedAt); r.sesiones++; r.usuariosApp.add(s.userId); r.minutos += Math.max(1, (new Date(s.lastPingAt) - new Date(s.startedAt)) / 60000); });
  logins.forEach((u) => { get(u.lastLogin).usuariosApp.add(u.id); });
  refundsR.forEach((c) => { const r = get(c.claimedAt); r.reembolsos++; r.montoReembolsos += Number(c.amount) || 0; });
  spinsR.forEach((s) => { const r = get(s.spunAt); r.giros++; r.premiosRuleta += Number(s.prizeARS) || 0; });
  const rows = buckets.map((b) => { const r = series[b]; return { bucket: b, registros: r.registros, primerasCargas: r.primerasCargas, cargas: r.cargas, montoCargas: Math.round(r.montoCargas), cargadores: r.cargadores.size, retiros: r.retiros, montoRetiros: Math.round(r.montoRetiros), netwin: Math.round(r.montoCargas - r.montoRetiros), sesiones: r.sesiones, usuariosApp: r.usuariosApp.size, minPorSesion: r.sesiones ? Math.round(r.minutos / r.sesiones * 10) / 10 : null, reembolsos: r.reembolsos, montoReembolsos: Math.round(r.montoReembolsos), giros: r.giros, premiosRuleta: Math.round(r.premiosRuleta) }; });

  // Totales
  const depositors = new Set(depsR.map((t) => t.userId));
  const appUsers = new Set([...sessR.map((s) => s.userId), ...logins.map((u) => u.id)]);
  const totMin = sum(sessR.map((s) => Math.max(1, (new Date(s.lastPingAt) - new Date(s.startedAt)) / 60000)));
  const days = Math.max(1, Math.round((to - from) / 86400000));
  const totals = {
    dias: days, registros: regs.length, primerasCargas: firstInRange.length, cargas: depsR.length, montoCargas: Math.round(sum(depsR.map((t) => t.amount))),
    cargadores: depositors.size, retiros: wdsR.length, montoRetiros: Math.round(sum(wdsR.map((t) => t.amount))),
    netwin: Math.round(sum(depsR.map((t) => t.amount)) - sum(wdsR.map((t) => t.amount))),
    cargasPorCargador: depositors.size ? Math.round(depsR.length / depositors.size * 10) / 10 : null,
    cargaPromedio: depsR.length ? Math.round(sum(depsR.map((t) => t.amount)) / depsR.length) : null,
    usuariosApp: appUsers.size, sesiones: sessR.length, minPorSesion: sessR.length ? Math.round(totMin / sessR.length * 10) / 10 : null,
    sesionesPorUsuarioDia: appUsers.size ? Math.round(sessR.length / appUsers.size / days * 100) / 100 : null,
    instalados: new Set(sessR.filter((s) => s.installed).map((s) => s.userId)).size,
    reembolsos: refundsR.length, montoReembolsos: Math.round(sum(refundsR.map((r) => r.amount))), giros: spinsR.length, premiosRuleta: Math.round(sum(spinsR.map((s) => s.prizeARS))),
    mensajesSoporte: supportMsgs, churn30, conversionRegistroCarga: pct(firstInRange.length, regs.length),
    spend, cac: spend > 0 && firstInRange.length ? Math.round(spend / firstInRange.length) : null,
    netwinPorNuevo: firstInRange.length ? Math.round(sum(firstInRange.map(([u]) => sum((depsByUser.get(u) || []).filter((d) => inRange(d)).map(() => 0)))) ) : null
  };
  // netwin que dejaron los NUEVOS del rango (cargas − retiros de esos usuarios dentro del rango)
  const newIds = new Set(firstInRange.map(([u]) => u));
  const nwNew = sum(depsR.filter((t) => newIds.has(t.userId)).map((t) => t.amount)) - sum(wdsR.filter((t) => newIds.has(t.userId)).map((t) => t.amount));
  totals.netwinNuevos = Math.round(nwNew);
  totals.netwinPorNuevo = newIds.size ? Math.round(nwNew / newIds.size) : null;

  // Período anterior (misma longitud) para crecimiento
  const prevTo = new Date(from.getTime() - 1), prevFrom = new Date(from.getTime() - (to - from) - 1);
  const prevFirst = [...firstDepAt.values()].filter((d) => d >= prevFrom && d <= prevTo).length;
  const prevRegs = await User.countDocuments({ ...userFilter, createdAt: { $gte: prevFrom, $lte: prevTo } });
  const prevDeps = deps.filter((d) => { const t = new Date(d.timestamp); return t >= prevFrom && t <= prevTo; });
  const growth = { primerasCargas: pct(firstInRange.length - prevFirst, prevFirst), registros: pct(regs.length - prevRegs, prevRegs), montoCargas: pct(sum(depsR.map((t) => t.amount)) - sum(prevDeps.map((t) => t.amount)), sum(prevDeps.map((t) => t.amount))), prev: { primerasCargas: prevFirst, registros: prevRegs, montoCargas: Math.round(sum(prevDeps.map((t) => t.amount))) } };

  return { from: dateKeyART(from), to: dateKeyART(to), granularity: gran, campaign: campaign || null, totals, retention: ret, repeat, growth, rows, informe: narrative(totals, ret, growth, gran, repeat) };
}

function grade(v, good, ok) { if (v == null) return null; return v >= good ? 'bien' : (v >= ok ? 'regular' : 'flojo'); }
function narrative(t, r, g, gran, rp) {
  const L = [];
  const per = gran === 'month' ? 'mes' : (gran === 'week' ? 'semana' : 'día');
  // Captación
  L.push(`📥 CAPTACIÓN: ${t.registros} registros y ${t.primerasCargas} clientes que cargaron por primera vez en ${t.dias} día(s)` +
    (t.conversionRegistroCarga != null ? ` (${t.conversionRegistroCarga}% de los registrados llegó a cargar)` : '') +
    (g.primerasCargas != null ? `. Contra el período anterior: primeras cargas ${g.primerasCargas >= 0 ? '+' : ''}${g.primerasCargas}% (${g.prev.primerasCargas}), registros ${g.registros >= 0 ? '+' : ''}${g.registros}%.` : '.'));
  if (t.conversionRegistroCarga != null) L.push(t.conversionRegistroCarga >= 35 ? '   → La conversión registro → carga es buena.' : (t.conversionRegistroCarga >= 20 ? '   → Conversión registro → carga aceptable: muchos se registran y no cargan; revisar el primer mensaje y la carga mínima.' : '   → Conversión registro → carga baja: la mayoría entra y no carga. Hay que trabajar el primer contacto (soporte, bono de bienvenida, claridad del CBU).'));
  // Retención
  if (r.cohort) {
    L.push(`🔁 RETENCIÓN (de los ${r.cohort} que cargaron por primera vez): volvió a cargar a los 7 días el ${r.d7 ?? 0}%, a los 30 días el ${r.d30 ?? 0}%, y en el ${per} siguiente el ${r.next ?? 0}%. Volvió a ENTRAR a la app en la primera semana el ${r.login7 ?? 0}%.`);
    const gd = grade(r.d30, 40, 20);
    L.push(gd === 'bien' ? '   → Retención a 30 días BUENA: el producto gusta y la gente vuelve a cargar.' : (gd === 'regular' ? '   → Retención a 30 días REGULAR: vuelve una parte; conviene empujar con reembolsos/fueguito y avisos a los que no vuelven.' : '   → Retención a 30 días FLOJA: la mayoría carga una vez y no vuelve. Antes de invertir más en publicidad, revisar la experiencia después de la primera carga.'));
    if (r.login7 != null && r.d7 != null && r.login7 - r.d7 >= 25) L.push('   → Muchos vuelven a ENTRAR pero no vuelven a CARGAR: están interesados; falta un motivo para la segunda carga (bono en la 2ª carga, recordatorio).');
  } else L.push('🔁 RETENCIÓN: no hubo primeras cargas en el rango, no se puede medir.');
  if (rp && rp.cohort) {
    L.push(`🪜 DESPUÉS DE LA PRIMERA CARGA (los ${rp.cohort} nuevos del rango, contando todo lo que cargaron hasta hoy): ${rp.siguieronCargando} siguieron cargando (${rp.pctSiguieron}%) y ${rp.una} se quedaron en una sola carga (${rp.pctUna}%). Escalera: 2-3 cargas ${rp.dosTres} (${rp.pctDosTres}%) · 4-9 cargas ${rp.cuatroNueve} (${rp.pctCuatroNueve}%) · 10 o más ${rp.diezMas} (${rp.pctDiezMas}%). Hoy siguen activos (cargaron en los últimos 14 días) ${rp.activos14} (${rp.pctActivos14}%); perdidos (más de 30 días sin cargar) ${rp.perdidos30} (${rp.pctPerdidos30}%). Cada nuevo dejó en promedio ${rp.cargasPorCliente} cargas y ${money(rp.montoPorCliente)}.`);
    L.push(rp.pctSiguieron >= 50 ? '   → QUEDAN MUCHOS: más de la mitad vuelve a cargar después de la primera. Base sana.' : (rp.pctSiguieron >= 30 ? '   → SE PIERDE UNA PARTE IMPORTANTE en el camino: entre 3 y 5 de cada 10 siguen. Vale la pena trabajar la segunda carga.' : '   → SE PIERDE LA MAYORÍA en el camino: menos de 3 de cada 10 vuelven a cargar. El problema no es traer gente sino retenerla.'));
  }
  if (t.churn30 != null) L.push(`📉 ABANDONO: el ${t.churn30}% de los que alguna vez cargaron no carga hace más de 30 días.` + (t.churn30 >= 70 ? ' Es alto: la base se enfría; campañas de recuperación.' : (t.churn30 >= 45 ? ' Normal para el rubro; vale un lote de recuperación.' : ' Bajo: la base está activa.')));
  // Uso de la app
  if (t.sesiones) L.push(`📱 USO DE LA APP: ${t.usuariosApp} usuarios entraron, ${t.sesiones} sesiones, ${t.minPorSesion} min por sesión en promedio, ${t.sesionesPorUsuarioDia} sesiones por usuario por día; ${t.instalados} usaron la app instalada.` +
    (t.minPorSesion >= 4 ? ' Se quedan un buen rato: la app engancha.' : (t.minPorSesion >= 2 ? ' Visitas cortas: entran, hacen lo suyo y salen (normal si vienen a cargar).' : ' Visitas muy cortas: entran y se van rápido; revisar si encuentran lo que buscan.')));
  else L.push(`📱 USO DE LA APP: ${t.usuariosApp} usuarios entraron (sin medición de tiempo en sesión todavía: el medidor arranca con la versión nueva de la app).`);
  // Dinero
  L.push(`💰 DINERO: ${t.cargas} cargas por ${money(t.montoCargas)} (${t.cargadores} cargadores, ${t.cargasPorCargador ?? 0} cargas por cargador, promedio ${money(t.cargaPromedio)}), ${t.retiros} retiros por ${money(t.montoRetiros)}. NETWIN del período: ${money(t.netwin)}. Reembolsos pagados: ${money(t.montoReembolsos)} (${t.reembolsos}); ruleta: ${t.giros} giros, ${money(t.premiosRuleta)} en premios.`);
  if (t.cargasPorCargador != null) L.push(t.cargasPorCargador >= 3 ? '   → Frecuencia de carga alta: los que cargan, repiten.' : (t.cargasPorCargador >= 1.8 ? '   → Frecuencia de carga media.' : '   → Frecuencia de carga baja: la mayoría carga una sola vez en el período.'));
  // Inversión
  if (t.spend > 0) {
    L.push(`📣 INVERSIÓN: ${money(t.spend)} gastados → costo por cliente nuevo (primera carga): ${t.cac != null ? money(t.cac) : '—'}. Los ${t.primerasCargas} nuevos dejaron ${money(t.netwinNuevos)} de netwin en el período (${money(t.netwinPorNuevo)} por cliente).`);
    if (t.cac != null && t.netwinPorNuevo != null) L.push(t.netwinPorNuevo >= t.cac * 1.3 ? '   → La inversión RINDE: cada cliente nuevo deja más de lo que costó traerlo, ya dentro del período.' : (t.netwinPorNuevo >= t.cac * 0.8 ? '   → La inversión está al LÍMITE: el cliente nuevo paga casi lo que costó; depende de que vuelva a cargar (ver retención).' : '   → La inversión NO se recupera en el período: cada cliente nuevo cuesta más de lo que deja. Si la retención es buena puede cerrar más adelante; si no, bajar el gasto o cambiar la pauta.'));
  } else L.push('📣 INVERSIÓN: cargá el gasto en publicidad del período para calcular el costo por cliente nuevo y si se recupera.');
  L.push(`💬 SOPORTE: ${t.mensajesSoporte} mensajes de clientes en el período.`);
  // Veredicto
  const score = [grade(r.d30, 40, 20), grade(t.conversionRegistroCarga, 35, 20), t.cargasPorCargador != null ? (t.cargasPorCargador >= 3 ? 'bien' : (t.cargasPorCargador >= 1.8 ? 'regular' : 'flojo')) : null].filter(Boolean);
  const good = score.filter((x) => x === 'bien').length, bad = score.filter((x) => x === 'flojo').length;
  L.push(score.length ? (good >= 2 && !bad ? '✅ VEREDICTO: el negocio está sano: la gente carga, vuelve y repite. Vale invertir más.' : (bad >= 2 ? '🔴 VEREDICTO: hay señales de alarma (conversión/retención/frecuencia flojas). Antes de escalar la pauta, ajustar producto y seguimiento.' : '🟡 VEREDICTO: va, pero con puntos a mejorar; mantener la inversión y corregir lo marcado arriba.')) : 'ℹ️ VEREDICTO: todavía no hay datos suficientes en este rango.');
  return L;
}

// Comparativa contra la otra página (números cargados a mano). `other` = { label, from, to, firstDeposits, usersEntered, deposits, depositsSum, avgSessionMin, retentionPct }
function compare(ours, other) {
  const dOther = Math.max(1, Math.round((new Date(other.to) - new Date(other.from)) / 86400000) + 1);
  const perDay = (v) => (v == null || v === '' ? null : Math.round((Number(v) / dOther) * 100) / 100);
  const oursDays = ours.totals.dias;
  const rows = [];
  const add = (k, label, o, t, higherBetter = true, fmt = (x) => x) => {
    const od = o == null ? null : Math.round((o / oursDays) * 100) / 100, td = t == null ? null : perDay(t);
    const diff = od != null && td != null && td > 0 ? Math.round(((od - td) / td) * 1000) / 10 : null;
    rows.push({ key: k, label, ours: o, oursPerDay: od, other: t == null || t === '' ? null : Number(t), otherPerDay: td, diffPct: diff, better: diff == null ? null : (higherBetter ? diff > 5 : diff < -5), worse: diff == null ? null : (higherBetter ? diff < -5 : diff > 5), fmt: fmt.name || null });
  };
  add('firstDeposits', 'Clientes que cargaron por primera vez', ours.totals.primerasCargas, other.firstDeposits);
  add('usersEntered', 'Usuarios que entraron a la app', ours.totals.usuariosApp, other.usersEntered);
  add('deposits', 'Cantidad de depósitos', ours.totals.cargas, other.deposits);
  add('depositsSum', 'Monto depositado', ours.totals.montoCargas, other.depositsSum);
  if (other.avgSessionMin != null && other.avgSessionMin !== '') rows.push({ key: 'avgSessionMin', label: 'Minutos por sesión (medidor)', ours: ours.totals.minPorSesion, other: Number(other.avgSessionMin), diffPct: ours.totals.minPorSesion && Number(other.avgSessionMin) > 0 ? Math.round(((ours.totals.minPorSesion - Number(other.avgSessionMin)) / Number(other.avgSessionMin)) * 1000) / 10 : null, better: null, worse: null });
  if (other.retentionPct != null && other.retentionPct !== '') rows.push({ key: 'retention', label: 'Retención (volvió a cargar, %)', ours: ours.retention.d30, other: Number(other.retentionPct), diffPct: ours.retention.d30 != null && Number(other.retentionPct) > 0 ? Math.round(((ours.retention.d30 - Number(other.retentionPct)) / Number(other.retentionPct)) * 1000) / 10 : null, better: null, worse: null });
  rows.forEach((r) => { if (r.better == null && r.diffPct != null) { r.better = r.diffPct > 5; r.worse = r.diffPct < -5; } });
  const b = rows.filter((r) => r.better).length, w = rows.filter((r) => r.worse).length, n = rows.filter((r) => r.diffPct != null).length;
  const verdict = !n ? 'Faltan números de la otra página para comparar.' : (b > w ? `La app nueva va MEJOR en ${b} de ${n} indicadores (comparando por día).` : (w > b ? `La app nueva va PEOR en ${w} de ${n} indicadores (comparando por día).` : 'Parejas: sin diferencias claras por día.'));
  return { otherLabel: other.label || 'Otra página', otherDays: dOther, oursDays, rows, verdict };
}


// #460 (owner): CALCULADOR DE INVERSIÓN. Con lo observado en el período base (últimos N días) proyecta qué deja una inversión
// de $X durante D días: clientes nuevos (según costo por cliente observado o el que se indique), cargas, monto, retiros,
// netwin, clientes activos al final, más la base orgánica (lo que ya entra sin pauta). Tres escenarios: bajo / base / alto.
function project(base, opts) {
  const spend = Math.max(0, Number(opts.spend) || 0), days = Math.max(1, Math.min(365, parseInt(opts.days, 10) || 30));
  const t = base.totals, rp = base.repeat, baseDays = Math.max(1, t.dias);
  const cac = Number(opts.cac) > 0 ? Number(opts.cac) : (t.cac || null);
  const perDayFirst = t.primerasCargas / baseDays;                   // ritmo actual de primeras cargas (con el gasto que haya habido)
  const organicPerDay = t.spend > 0 ? null : perDayFirst;             // si no hubo gasto, todo es orgánico
  const cargasPorCliente = rp.cargasPorCliente || t.cargasPorCargador || 1;
  const montoPorCliente = rp.montoPorCliente || t.cargaPromedio || 0;
  const wdRatio = t.montoCargas > 0 ? Math.min(0.95, t.montoRetiros / t.montoCargas) : 0.5;  // qué parte de lo cargado se retira
  const activePct = (rp.pctActivos14 != null ? rp.pctActivos14 : 30) / 100;
  const reembPct = t.montoCargas > 0 ? t.montoReembolsos / t.montoCargas : 0;
  const scale = (x) => Math.round(x);
  const mk = (f) => {
    const nuevos = cac ? (spend / cac) * f : 0;
    const organicos = (organicPerDay != null ? organicPerDay : perDayFirst * 0.5) * days * f; // sin dato: mitad del ritmo actual
    const totalNuevos = nuevos + organicos;
    const monto = totalNuevos * montoPorCliente * Math.min(1.5, Math.max(0.5, days / 30)); // el monto por cliente observado es "hasta hoy": se escala al largo del período
    const retiros = monto * wdRatio, reemb = monto * reembPct;
    const netwin = monto - retiros - reemb;
    return { clientesPorPauta: scale(nuevos), clientesOrganicos: scale(organicos), clientesNuevos: scale(totalNuevos), cargas: scale(totalNuevos * cargasPorCliente), montoCargas: scale(monto), retiros: scale(retiros), reembolsos: scale(reemb), netwin: scale(netwin), activosAlFinal: scale(totalNuevos * activePct), resultado: scale(netwin - spend), roi: spend > 0 ? Math.round(((netwin - spend) / spend) * 100) : null, costoPorCliente: cac ? scale(cac / f) : null };
  };
  return {
    supuestos: { diasBase: baseDays, cac, cacOrigen: Number(opts.cac) > 0 ? 'indicado' : (t.cac ? 'observado' : 'sin dato'), primerasCargasPorDia: Math.round(perDayFirst * 100) / 100, cargasPorCliente, montoPorCliente: scale(montoPorCliente), pctRetirado: Math.round(wdRatio * 100), pctReembolsos: Math.round(reembPct * 100), pctActivos: Math.round(activePct * 100), gastoBase: t.spend || 0 },
    spend, days, bajo: mk(0.7), base: mk(1), alto: mk(1.3),
    nota: cac ? null : 'No hay costo por cliente nuevo: cargá el gasto en publicidad de un período con pauta (Análisis → Gasto) o indicá el costo a mano.'
  };
}
module.exports = { analyze, compare, project, dateKeyART };
