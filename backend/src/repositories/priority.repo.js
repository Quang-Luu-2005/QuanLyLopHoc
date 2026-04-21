const { pool } = require('../db/pool');

function runner(client) {
  return client || pool;
}

async function listWeekPriorities(client, weekKey) {
  const db = runner(client);
  const result = await db.query(
    `
      SELECT email
      FROM weekly_priorities
      WHERE week_key = $1::date AND priority = TRUE
    `,
    [weekKey]
  );

  const map = {};
  result.rows.forEach((row) => {
    map[String(row.email || '').toLowerCase()] = true;
  });
  return map;
}

async function saveWeekPriorities(client, weekKey, emails) {
  const db = runner(client);
  const list = Array.isArray(emails) ? emails : [];

  await db.query('DELETE FROM weekly_priorities WHERE week_key = $1::date', [weekKey]);

  let inserted = 0;
  for (let i = 0; i < list.length; i += 1) {
    const email = String(list[i] || '').trim().toLowerCase();
    if (!email) {
      continue;
    }

    await db.query(
      `
        INSERT INTO weekly_priorities (week_key, email, priority)
        VALUES ($1::date, $2, TRUE)
      `,
      [weekKey, email]
    );
    inserted += 1;
  }

  return inserted;
}

module.exports = {
  listWeekPriorities,
  saveWeekPriorities
};
