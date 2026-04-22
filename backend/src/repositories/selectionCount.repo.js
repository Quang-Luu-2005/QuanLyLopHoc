const { connect } = require('../db/pool');
const SelectionCountLog = require('../models/SelectionCountLog');

async function listSelectionCountMap() {
  await connect();
  const result = await SelectionCountLog.aggregate([
    {
      $group: {
        _id: { $toLower: '$email' },
        selectedCount: { $sum: 1 }
      }
    }
  ]);

  const map = {};
  result.forEach((r) => {
    map[r._id] = r.selectedCount;
  });
  return map;
}

async function listSelectionDedupMap(session, weekKey, eventDate) {
  await connect();
  const opts = {};
  if (session) opts.session = session;

  const rows = await SelectionCountLog.find(
    { weekKey: String(weekKey), eventDate: String(eventDate) },
    { email: 1 },
    opts
  ).lean();

  const map = {};
  rows.forEach((row) => {
    map[String(row.email || '').toLowerCase()] = true;
  });
  return map;
}

async function insertSelectionCountLogs(session, rows) {
  await connect();
  let inserted = 0;

  for (const item of rows) {
    try {
      const doc = new SelectionCountLog({
        weekKey: String(item.weekKey),
        eventDate: String(item.eventDate),
        email: String(item.email || '').trim().toLowerCase(),
        name: item.name ? String(item.name) : null,
        ingame: item.ingame ? String(item.ingame) : null,
        rank: item.rank ? String(item.rank) : null,
        source: item.source ? String(item.source) : null
      });
      await doc.save(session ? { session } : {});
      inserted += 1;
    } catch (e) {
      if (e.code === 11000) continue;
      throw e;
    }
  }

  return inserted;
}

module.exports = {
  listSelectionCountMap,
  listSelectionDedupMap,
  insertSelectionCountLogs
};
