// #917: estado de cada sorteo mensual (abierto → cerrado el día 1 con los ganadores congelados) + entrega de premios.
// monthKey 'lock' es el candado del cron (multi-instancia): una sola instancia calcula a la vez.
const mongoose = require('mongoose');
const winner = new mongoose.Schema({
  pos: Number, userId: String, username: String, masked: String, points: Number, validWagered: Number, prize: String,
  contactAt: { type: Date, default: null },     // el ganador tocó "Coordinar la entrega" (soporte de premios)
  deliveredAt: { type: Date, default: null }, deliveredBy: { type: String, default: null }, deliveryNote: { type: String, default: '' }
}, { _id: false });
const schema = new mongoose.Schema({
  monthKey: { type: String, required: true, unique: true, index: true },
  status: { type: String, enum: ['open', 'closed', 'lock'], default: 'open' },
  closedAt: { type: Date, default: null },
  participants: { type: Number, default: 0 },
  winners: { type: [winner], default: [] },
  lastRunAt: { type: Date, default: null },
  lockUntil: { type: Date, default: null }
});
module.exports = mongoose.models['RaffleMonth'] || mongoose.model('RaffleMonth', schema);
