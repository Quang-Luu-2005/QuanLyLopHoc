const { pool } = require('../db/pool');

function runner(client) {
  return client || pool;
}

async function listSelectionCountMap() {
  const result = await pool.query(
    `
      SELECT LOWER(email) AS email_key, COUNT(*)::int AS selected_count
      FROM selection_count_logs
      GROUP BY LOWER(email)
    `
  );

  const map = {};
  result.rows.forEach((row) => {
    map[row.email_key] = Number(row.selected_count || 0);
  });

  return map;
}

async function listSelectionDedupMap(client, weekKey, eventDate) {
  const db = runner(client);
  const result = await db.query(
    `
      SELECT LOWER(email) AS email_key
      FROM selection_count_logs
      WHERE week_key = $1::date AND event_date = $2::date
    `,
    [weekKey, eventDate]
  );

  const map = {};
  result.rows.forEach((row) => {
    map[row.email_key] = true;
  });

  return map;
}

async function insertSelectionCountLogs(client, rows) {
  const db = runner(client);
  let inserted = 0;

  for (let i = 0; i < rows.length; i += 1) {
    const item = rows[i];

    const result = await db.query(
      `
        INSERT INTO selection_count_logs (
          week_key,
          event_date,
          email,
          name,
          ingame,
          rank,
          source
        )
        VALUES ($1::date, $2::date, $3, $4, $5, $6, $7)
        ON CONFLICT (week_key, event_date, email)
        DO NOTHING
        RETURNING id
      `,
      [
        item.weekKey,
        item.eventDate,
        String(item.email || '').trim().toLowerCase(),
        item.name ? String(item.name) : null,
        item.ingame ? String(item.ingame) : null,
        item.rank ? String(item.rank) : null,
        item.source ? String(item.source) : null
      ]
    );

    if (result.rowCount > 0) {
      inserted += 1;
    }
  }

  return inserted;
}

module.exports = {
  listSelectionCountMap,
  listSelectionDedupMap,
  insertSelectionCountLogs
};
