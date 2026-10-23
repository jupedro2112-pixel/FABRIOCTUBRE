// #917 (owner 2026-10-23): SORTEO MENSUAL por puntos. Un documento por (mes, cliente) con lo que suma en el mes según 1girox:
// apostado total, bonos recibidos y cargas reales ⇒ apostado VÁLIDO (sólo la parte de plata real) ⇒ puntos (100 cada $100.000).
// Lo recalcula el cron `_raffleTick` con $set (nunca $inc): repetirlo da siempre el mismo resultado.
const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  monthKey: { type: String, required: true, index: true },   // YYYY-MM (hora argentina)
  userId: { type: String, required: true, index: true },
  username: { type: String, default: '' },
  deposits: { type: Number, default: 0 },       // cargas reales del mes (Transaction deposit, sin pruebas ni regalos)
  wagered: { type: Number, default: 0 },        // apostado total del mes (1girox /players/stats)
  bonusGranted: { type: Number, default: 0 },   // bonos recibidos en el mes (1girox bonus.granted)
  validWagered: { type: Number, default: 0 },   // wagered × deposits / (deposits + bonusGranted)
  points: { type: Number, default: 0, index: true },
  updatedAt: { type: Date, default: Date.now }
});
schema.index({ monthKey: 1, userId: 1 }, { unique: true });
schema.index({ monthKey: 1, points: -1 });
module.exports = mongoose.models['RaffleScore'] || mongoose.model('RaffleScore', schema);
