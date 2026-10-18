// #500 (owner 2026-10-18): CIERRE DIARIO AUTOMÁTICO. Como no va a haber empleados que hagan cierres, el server genera uno por
// día (hora argentina) con los números reales (depósitos, retiros, VENTA = netwin, regalos, NETO, nuevos vs retenidos) y el
// admin sólo completa la COMISIÓN DEL BANCO (o se aplica el % por defecto de Config['closeConfig']) y, al final, la COTIZACIÓN
// USDT → el cierre pasa a 'finalizado' con el resultado en pesos y en dólares. Único por dateKey (idempotente entre instancias).
const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  dateKey: { type: String, required: true, unique: true, index: true },   // YYYY-MM-DD (ART)
  status: { type: String, enum: ['pendiente', 'finalizado'], default: 'pendiente', index: true },
  // Números del día (pesos), generados automáticamente
  depositos: { type: Number, default: 0 }, cargas: { type: Number, default: 0 }, cargadores: { type: Number, default: 0 },
  retiros: { type: Number, default: 0 }, retirosN: { type: Number, default: 0 },
  venta: { type: Number, default: 0 },          // netwin = depósitos − retiros
  regalos: { type: Number, default: 0 },        // bonos, reembolsos, ruleta, fueguito, VIP, instalar, referidos
  neto: { type: Number, default: 0 },           // venta − regalos
  nuevos: { type: Number, default: 0 }, retenidos: { type: Number, default: 0 },
  ventaRetenidos: { type: Number, default: 0 }, ventaNuevos: { type: Number, default: 0 },
  // #501 ARQUEO: lo que dice el BANCO vs lo que dice el sistema. Auto = movimientos del banco (webhook hgcash) y payouts pagados;
  // manual = lo que el admin lee del resumen del banco (pisa lo automático). diferencia = (entró − salió del banco) − (depósitos − retiros)
  bankInAuto: { type: Number, default: 0 }, bankOutAuto: { type: Number, default: 0 }, payoutsPaid: { type: Number, default: 0 }, bankMovsIn: { type: Number, default: 0 },
  bankInManual: { type: Number, default: null }, bankOutManual: { type: Number, default: null },
  bankIn: { type: Number, default: 0 }, bankOut: { type: Number, default: 0 },
  difIn: { type: Number, default: 0 }, difOut: { type: Number, default: 0 }, diferencia: { type: Number, default: 0 },
  arqueo: { type: String, enum: ['sin_datos', 'cuadra', 'faltante', 'sobrante'], default: 'sin_datos' },
  // Lo que completa el admin
  bankCommissionPct: { type: Number, default: null },   // % sobre los depósitos (si se usa el % por defecto)
  bankCommissionArs: { type: Number, default: 0 },      // monto final de comisión (pesos)
  bankCommissionSource: { type: String, default: null }, // 'default' | 'manual' (monto) | 'manual_pct' (% del día, #501)
  resultado: { type: Number, default: 0 },              // neto − comisión del banco
  usdtRate: { type: Number, default: null },
  resultadoUsd: { type: Number, default: null },
  notes: { type: String, default: '' },
  generatedAt: { type: Date, default: Date.now },
  recalculatedAt: { type: Date, default: null },
  finalizedAt: { type: Date, default: null },
  finalizedBy: { type: String, default: null },
  updatedBy: { type: String, default: null }
});
module.exports = mongoose.models['DailyClose'] || mongoose.model('DailyClose', schema);
