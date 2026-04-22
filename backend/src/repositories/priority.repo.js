const { connect } = require('../db/pool');
const WeeklyPriority = require('../models/WeeklyPriority');

async function listWeekPriorities(session, weekKey) {
  await connect();
  const opts = {};
  if (session) opts.session = session;

  const rows = await WeeklyPriority.find({ weekKey: String(weekKey), priority: true }, null, opts).lean();
  const map = {};
  rows.forEach((row) => {
    map[String(row.email || '').toLowerCase()] = true;
  });
  return map;
}

async function saveWeekPriorities(session, weekKey, emails) {
  await connect();
  const key = String(weekKey);
  const list = Array.isArray(emails) ? emails : [];

  const deleteOpts = {};
  if (session) deleteOpts.session = session;
  await WeeklyPriority.deleteMany({ weekKey: key }, deleteOpts);

  let inserted = 0;
  for (const raw of list) {
    const email = String(raw || '').trim().toLowerCase();
    if (!email) continue;

    try {
      const doc = new WeeklyPriority({ weekKey: key, email, priority: true });
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
  listWeekPriorities,
  saveWeekPriorities
};
