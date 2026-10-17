/**
 * Story — "historias" de la app (#361, owner 2026-10-17): contenido que publica el ADMIN
 * desde el panel y que los clientes ven arriba a la derecha de la app (al lado de Perfil),
 * estilo historias de Instagram/WhatsApp: pantalla completa, barra de progreso, pasa sola.
 *
 * Cada historia vence sola: `expiresAt = publishedAt + hours` (horas configurables por
 * historia; default Config['storiesDefaultHours'], 24). Vencida ⇒ no se muestra en la app
 * pero queda en el panel (se puede "extender" o borrar).
 *
 * Media: o bien una URL (ruta del repo "/images/…" o https) o bien el archivo subido desde
 * el panel guardado como data URL en `mediaData` (se sirve en GET /api/stories/:id/media).
 * Se guarda en Mongo a propósito: el disco de EB/Render es efímero y hay N instancias.
 *
 * ⚠️ No confundir con `InfluencerStory` (placements pagos de influencers, analítica de
 * publicistas): nada que ver.
 */
const mongoose = require('mongoose');

const storySchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  title: { type: String, default: '', trim: true, maxlength: 60 },
  text: { type: String, default: '', trim: true, maxlength: 300 },
  // 'image' | 'video' | 'none' (solo texto sobre color)
  mediaType: { type: String, enum: ['image', 'video', 'none'], default: 'none' },
  // Ruta del repo o https (si viene de acá no se usa mediaData).
  mediaUrl: { type: String, default: '', maxlength: 500 },
  // data URL del archivo subido desde el panel (imagen ≤ 4 MB / video mp4 ≤ 8 MB).
  mediaData: { type: String, default: '', select: false },
  mediaMime: { type: String, default: '' },
  bgColor: { type: String, default: '#06070d', maxlength: 20 },
  linkUrl: { type: String, default: '', maxlength: 500 },
  linkLabel: { type: String, default: '', maxlength: 40 },
  // Segundos que se muestra cada historia (imagen/texto). El video usa su propia duración.
  durationSec: { type: Number, default: 6, min: 2, max: 60 },
  hours: { type: Number, default: 24, min: 1, max: 720 },
  publishedAt: { type: Date, default: Date.now, index: true },
  expiresAt: { type: Date, required: true, index: true },
  isActive: { type: Boolean, default: true, index: true },
  views: { type: Number, default: 0 },
  createdBy: { type: String, default: null },
  createdAt: { type: Date, default: Date.now }
});

storySchema.index({ isActive: 1, expiresAt: 1, publishedAt: 1 });

module.exports = mongoose.models.Story || mongoose.model('Story', storySchema);
