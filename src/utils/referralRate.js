/**
 * referralRate.js — Cuánto se lleva el referidor.
 *
 * REGLA DE NEGOCIO (owner, 2026-07-31):
 *
 *     comisión del referidor = netwin del referido × 8%
 *
 * Una sola tasa, aplicada UNA sola vez. Si un referido perdió $100.000 jugando en el
 * mes, su referidor cobra $8.000 en fichas.
 *
 * ⚠️ HISTORIA — por qué esto está comentado tan fuerte:
 * El default era 7% y se aplicaba SOBRE una comisión previa (en JUGAYGANA, la que nos
 * daba el proveedor sobre el GGR). O sea, dos tasas encadenadas. Al migrar a 1girox
 * —donde el proveedor devuelve todas sus comisiones en 0— se puso un 8% en el primer
 * eslabón y quedó multiplicándose por el 7% de acá: el referidor cobraba **0,56%** del
 * netwin en vez del 8%. El encadenamiento se eliminó (ver
 * referralCalculationService.fetchReferredRevenue) y esta es ahora la ÚNICA tasa del
 * cálculo. Si alguien vuelve a multiplicar por otra cosa, se repite el bug.
 *
 * Configurable por env `GIROX_REFERRAL_COMMISSION_PCT` (en PORCENTAJE: 8 = 8%), y por
 * usuario con `referralRateOverride` (en DECIMAL: 0.08 = 8%) para acuerdos puntuales.
 */

/** Tasa por defecto, en decimal. 0.05 = 5% del netwin del referido (#351, owner 2026-10-17: "es un 5%, no un 8"). */
const DEFAULT_REFERRAL_RATE = 0.05;

// #351: % editable desde el panel (Referidos → "% de comisión"), guardado en Config['referralCommissionPct'].
// Cache por proceso: server.js lo refresca al arrancar y cada 60 s (multi-instancia) y el panel al guardar.
const CONFIG_KEY = 'referralCommissionPct';
let _cfgPct = null;
function setConfiguredPct(pct) {
  const n = Number(pct);
  _cfgPct = (Number.isFinite(n) && n > 0 && n <= 100) ? Math.round(n * 10) / 10 : null;
  return _cfgPct;
}
async function refreshFromConfig() {
  try {
    const Config = require('../models/Config');
    const v = await Config.get(CONFIG_KEY, null);
    setConfiguredPct(v);
  } catch (_) { /* se mantiene lo último */ }
  return _cfgPct;
}
/** % vigente (entero/1 decimal) para mostrar en la app y el panel. */
function getConfiguredPct() { return Math.round(getConfiguredRate() * 1000) / 10; }

/**
 * Tasa configurada por entorno, en decimal.
 *
 * Getter LAZY a propósito: los secrets/env se cargan desde SSM en el bootstrap async,
 * DESPUÉS de los `require()`. Leerlo en el top-level congelaría el default (mismo
 * patrón que `hgcashService.getToken()`).
 */
function getConfiguredRate() {
  if (_cfgPct != null) return _cfgPct / 100; // #351: panel > env > default
  const pct = Number(process.env.GIROX_REFERRAL_COMMISSION_PCT);
  // Sanea basura (NaN, negativos, >100) cayendo al default acordado: un porcentaje
  // inválido nunca debe traducirse en pagar de más ni en no pagar nada.
  if (Number.isFinite(pct) && pct > 0 && pct <= 100) return pct / 100;
  return DEFAULT_REFERRAL_RATE;
}

/**
 * Tasa de comisión aplicable a un referidor.
 * @param {Object} user - documento del usuario referidor
 * @returns {number} tasa decimal (ej. 0.08 para 8%)
 */
function getReferralRateForUser(user) {
  // Override por usuario (acuerdos puntuales). Se valida el rango: un valor corrupto
  // acá se paga en plata real.
  if (user && typeof user.referralRateOverride === 'number' &&
      Number.isFinite(user.referralRateOverride) &&
      user.referralRateOverride > 0 && user.referralRateOverride <= 1) {
    return user.referralRateOverride;
  }
  return getConfiguredRate();
}

module.exports = {
  DEFAULT_REFERRAL_RATE,
  CONFIG_KEY,
  setConfiguredPct,
  refreshFromConfig,
  getConfiguredPct,
  getConfiguredRate,
  getReferralRateForUser
};
