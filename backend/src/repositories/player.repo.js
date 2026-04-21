const { pool } = require('../db/pool');

function runner(client) {
  return client || pool;
}

async function upsertPlayer(client, input) {
  const db = runner(client);
  const result = await db.query(
    `
      INSERT INTO players (
        email,
        ingame_name,
        zalo_phone,
        is_student,
        highest_rank
      )
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (email)
      DO UPDATE SET
        ingame_name = EXCLUDED.ingame_name,
        zalo_phone = COALESCE(EXCLUDED.zalo_phone, players.zalo_phone),
        is_student = EXCLUDED.is_student,
        highest_rank = COALESCE(EXCLUDED.highest_rank, players.highest_rank),
        updated_at = NOW()
      RETURNING *
    `,
    [
      String(input.email || '').trim().toLowerCase(),
      String(input.ingameName || '').trim(),
      input.zaloPhone ? String(input.zaloPhone).trim() : null,
      !!input.isStudent,
      input.highestRank ? String(input.highestRank).trim() : null
    ]
  );

  return result.rows[0] || null;
}

async function getPlayerByEmail(client, email) {
  const db = runner(client);
  const result = await db.query(
    'SELECT * FROM players WHERE email = $1 LIMIT 1',
    [String(email || '').trim().toLowerCase()]
  );

  return result.rows[0] || null;
}

async function getPlayerById(client, playerId) {
  const db = runner(client);
  const result = await db.query(
    'SELECT * FROM players WHERE id = $1 LIMIT 1',
    [Number(playerId)]
  );

  return result.rows[0] || null;
}

async function listPlayers(filters) {
  const where = [];
  const params = [];

  if (filters && filters.email) {
    params.push(`%${String(filters.email).trim().toLowerCase()}%`);
    where.push(`LOWER(email) LIKE $${params.length}`);
  }

  const sql = `
    SELECT
      id,
      email,
      ingame_name AS "ingameName",
      zalo_phone AS "zaloPhone",
      is_student AS "isStudent",
      highest_rank AS "highestRank",
      created_at AS "createdAt",
      updated_at AS "updatedAt"
    FROM players
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY updated_at DESC, id DESC
    LIMIT 500
  `;

  const result = await pool.query(sql, params);
  return result.rows;
}

module.exports = {
  upsertPlayer,
  getPlayerById,
  getPlayerByEmail,
  listPlayers
};
