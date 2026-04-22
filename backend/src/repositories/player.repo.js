const { connect } = require('../db/pool');
const Player = require('../models/Player');

async function upsertPlayer(session, input) {
  await connect();
  const email = String(input.email || '').trim().toLowerCase();
  const set = {
    ingameName: String(input.ingameName || '').trim(),
    isStudent: !!input.isStudent
  };
  if (input.zaloPhone) set.zaloPhone = String(input.zaloPhone).trim();
  if (input.highestRank) set.highestRank = String(input.highestRank).trim();

  const opts = { new: true, upsert: true, setDefaultsOnInsert: true };
  if (session) opts.session = session;

  return Player.findOneAndUpdate({ email }, { $set: set }, opts);
}

async function getPlayerByEmail(session, email) {
  await connect();
  const opts = {};
  if (session) opts.session = session;
  return Player.findOne({ email: String(email || '').trim().toLowerCase() }, null, opts);
}

async function getPlayerById(session, playerId) {
  await connect();
  const opts = {};
  if (session) opts.session = session;
  try {
    return Player.findById(playerId, null, opts);
  } catch {
    return null;
  }
}

async function listPlayers(filters) {
  await connect();
  const query = {};
  if (filters && filters.email) {
    const escaped = String(filters.email).trim().toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    query.email = { $regex: escaped, $options: 'i' };
  }

  const players = await Player.find(query).sort({ updatedAt: -1, _id: -1 }).limit(500).lean({ virtuals: true });
  return players.map((p) => ({
    id: p.id,
    email: p.email,
    ingameName: p.ingameName,
    zaloPhone: p.zaloPhone || null,
    isStudent: p.isStudent,
    highestRank: p.highestRank || null,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt
  }));
}

module.exports = {
  upsertPlayer,
  getPlayerById,
  getPlayerByEmail,
  listPlayers
};
