const { pool } = require('../db/pool');

function runner(client) {
  return client || pool;
}

async function upsertFormSubmission(client, input) {
  const db = runner(client);
  const result = await db.query(
    `
      INSERT INTO form_submissions (
        player_id,
        submitted_at,
        source_sheet_row,
        source_sheet_name
      )
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (source_sheet_name, source_sheet_row)
      DO UPDATE SET
        player_id = EXCLUDED.player_id,
        submitted_at = EXCLUDED.submitted_at,
        updated_at = NOW()
      RETURNING *
    `,
    [
      Number(input.playerId),
      input.submittedAt,
      input.sourceSheetRow ? Number(input.sourceSheetRow) : null,
      input.sourceSheetName ? String(input.sourceSheetName).trim() : null
    ]
  );

  return result.rows[0] || null;
}

async function upsertPlayDate(client, playDate) {
  const db = runner(client);
  const result = await db.query(
    `
      INSERT INTO play_dates (play_date)
      VALUES ($1::date)
      ON CONFLICT (play_date)
      DO UPDATE SET play_date = EXCLUDED.play_date
      RETURNING *
    `,
    [playDate]
  );
  return result.rows[0] || null;
}

async function replaceSubmissionAvailableDates(client, submissionId, playDateIds) {
  const db = runner(client);

  await db.query('DELETE FROM submission_available_dates WHERE submission_id = $1', [submissionId]);

  if (!Array.isArray(playDateIds) || !playDateIds.length) {
    return;
  }

  for (let i = 0; i < playDateIds.length; i += 1) {
    await db.query(
      `
        INSERT INTO submission_available_dates (submission_id, play_date_id)
        VALUES ($1, $2)
        ON CONFLICT (submission_id, play_date_id)
        DO NOTHING
      `,
      [submissionId, playDateIds[i]]
    );
  }
}

async function listWeekKeys() {
  const result = await pool.query(
    `
      SELECT DISTINCT date_trunc('week', submitted_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS week_key
      FROM form_submissions
      ORDER BY week_key DESC
      LIMIT 120
    `
  );

  return result.rows.map((row) => row.week_key);
}

async function listWeekLatestSubmissions(weekKey) {
  const result = await pool.query(
    `
      WITH latest AS (
        SELECT DISTINCT ON (LOWER(p.email))
          fs.id AS submission_id,
          fs.player_id,
          fs.submitted_at,
          p.email,
          p.ingame_name,
          p.is_student,
          p.highest_rank
        FROM form_submissions fs
        JOIN players p ON p.id = fs.player_id
        WHERE date_trunc('week', fs.submitted_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = $1::date
        ORDER BY LOWER(p.email), fs.submitted_at DESC, fs.id DESC
      )
      SELECT
        submission_id AS "submissionId",
        player_id AS "playerId",
        submitted_at AS "submittedAt",
        email,
        ingame_name AS "ingameName",
        is_student AS "isStudent",
        highest_rank AS "highestRank"
      FROM latest
      ORDER BY submitted_at ASC, email ASC
    `,
    [weekKey]
  );

  return result.rows;
}

async function getLatestSubmissionForPlayerWeek(client, playerId, weekKey) {
  const db = runner(client);
  const result = await db.query(
    `
      SELECT *
      FROM form_submissions
      WHERE player_id = $1
        AND date_trunc('week', submitted_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = $2::date
      ORDER BY submitted_at DESC, id DESC
      LIMIT 1
    `,
    [Number(playerId), weekKey]
  );

  return result.rows[0] || null;
}

module.exports = {
  upsertFormSubmission,
  upsertPlayDate,
  replaceSubmissionAvailableDates,
  listWeekKeys,
  listWeekLatestSubmissions,
  getLatestSubmissionForPlayerWeek
};
