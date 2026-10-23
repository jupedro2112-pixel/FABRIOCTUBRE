const { MongoMemoryServer } = require('mongodb-memory-server'); const mongoose = require('mongoose'); const R = '/home/amnesia/Documents/FABRIOCTUBRE';
(async () => {
  const mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri());
  const User = require(R + '/src/models/User'), Transaction = require(R + '/src/models/Transaction'), Config = require(R + '/src/models/Config'), MissionClaim = require(R + '/src/models/MissionClaim');
  const RaffleScore = require(R + '/src/models/RaffleScore'), RaffleMonth = require(R + '/src/models/RaffleMonth'); const rs = require(R + '/src/services/raffleService');
  const ranges = [];
  const girox = { isSimulated: () => false, isEnabled: () => true, getPlayersStatsBatch: async (us, f, t) => { ranges.push(us.join(',') + ' desde ' + f.toISOString().slice(0, 16)); const days = (t - f) / 86400000; const players = {}; for (const u of us) players[u] = { wagered: Math.round(100000 * days), bonusGranted: 0 }; return { success: true, players }; } };
  const deps = { models: { User, Transaction, RaffleScore, RaffleMonth, Config, MissionClaim }, girox, logger: { warn() {} } };
  await User.collection.insertMany([
    { id: 'a', username: 'anotado', password: 'x', role: 'user', raffleJoinedAt: new Date('2026-10-28T12:00:00Z') },
    { id: 'b', username: 'tarde', password: 'x', role: 'user', raffleJoinedAt: new Date('2026-11-15T12:30:00Z') },
    { id: 'c', username: 'noanotado', password: 'x', role: 'user' },
    { id: 'd', username: 'listo', password: 'x', role: 'user', fcmTokens: [{ token: 'x', context: 'standalone', notifPermission: 'granted' }], raffleTelegramAt: new Date() },
    { id: 'e', username: 'sinapp', password: 'x', role: 'user', fcmTokens: [{ token: 'y', context: 'browser', notifPermission: 'granted' }], raffleTelegramAt: new Date() }]);
  for (const u of ['a', 'b', 'c']) for (const day of ['05', '20']) await Transaction.collection.insertOne({ id: u + day, type: 'deposit', amount: 20000, userId: u, status: 'completed', timestamp: new Date('2026-11-' + day + 'T15:00:00Z'), description: 'Carga', metadata: {} });
  await rs.tick(deps, { now: '2026-11-25T12:00:00Z' });
  for (const u of ['a', 'b', 'c']) { const sc = await RaffleScore.findOne({ monthKey: '2026-11', userId: u }).lean(); console.log(u, sc ? sc.points + ' pts (apostado contado $' + sc.wagered + ')' : 'NO suma (no anotado)'); }
  console.log('rangos pedidos a 1girox:', ranges.slice(0, 3).join(' | '));
  console.log('requisitos listo:', JSON.stringify(rs.requirementsOf(await User.findOne({ id: 'd' }).lean())), '· sinapp:', JSON.stringify(rs.requirementsOf(await User.findOne({ id: 'e' }).lean())));
  const st = await rs.publicStatus(deps, 'c', { now: '2026-11-25T12:00:00Z' }); console.log('no anotado ve: joined', st.joined, '· en el ranking:', st.top.map((t) => t.name).join(','));
  await mongoose.disconnect(); await mongod.stop(); process.exit(0);
})().catch((e) => { console.error('FALLO', e); process.exit(1); });
