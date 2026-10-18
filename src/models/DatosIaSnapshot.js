// #461 (owner 2026-10-18): HISTORIAL de Datos IA. Cada cálculo (análisis / proyección / comparativa) queda guardado con sus
// parámetros y resultado, para después comparar la estadística con lo real ("revisar") y ajustar las proyecciones
// siguientes (factor de calibración). TTL 2 años.
const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  kind: { type: String, enum: ['analysis', 'projection', 'compare'], required: true, index: true },
  createdAt: { type: Date, default: Date.now, index: true },
  by: { type: String, default: null },
  params: { type: mongoose.Schema.Types.Mixed, default: {} },
  summary: { type: mongoose.Schema.Types.Mixed, default: {} },   // números clave (chicos) para la lista
  result: { type: mongoose.Schema.Types.Mixed, default: {} },    // resultado completo
  review: { type: mongoose.Schema.Types.Mixed, default: null }   // proyección: { reviewedAt, elapsedDays, real, rows, factor }
});
schema.index({ kind: 1, createdAt: -1 });
schema.index({ createdAt: 1 }, { expireAfterSeconds: 730 * 24 * 3600 });
module.exports = mongoose.models['DatosIaSnapshot'] || mongoose.model('DatosIaSnapshot', schema);
