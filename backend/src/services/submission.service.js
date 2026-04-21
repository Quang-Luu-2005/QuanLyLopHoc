const { withTransaction } = require('../db/pool');
const playerRepo = require('../repositories/player.repo');
const submissionRepo = require('../repositories/submission.repo');
const { toDateOnly, formatDateOnly, getWeekKeyFromDate } = require('../utils/date');

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeAvailableDates(input) {
  const source = Array.isArray(input) ? input : [];
  const unique = {};
  const out = [];

  for (let i = 0; i < source.length; i += 1) {
    const date = toDateOnly(source[i]);
    if (!date) {
      continue;
    }

    const key = formatDateOnly(date);
    if (!key || unique[key]) {
      continue;
    }

    unique[key] = true;
    out.push(key);
  }

  return out;
}

async function syncSubmission(payload) {
  const email = normalizeEmail(payload && payload.email);
  if (!email) {
    const err = new Error('email is required');
    err.statusCode = 400;
    throw err;
  }

  const submittedAt = new Date(payload && payload.submittedAt ? payload.submittedAt : Date.now());
  if (Number.isNaN(submittedAt.getTime())) {
    const err = new Error('submittedAt is invalid');
    err.statusCode = 400;
    throw err;
  }

  const ingameName = String(
    (payload && payload.ingameName) ||
    (payload && payload.name) ||
    email.split('@')[0]
  ).trim();

  if (!ingameName) {
    const err = new Error('ingameName is required');
    err.statusCode = 400;
    throw err;
  }

  const availableDates = normalizeAvailableDates(payload && payload.availableDates);

  return withTransaction(async (client) => {
    const player = await playerRepo.upsertPlayer(client, {
      email,
      ingameName,
      zaloPhone: payload && payload.zaloPhone,
      isStudent: !!(payload && payload.isStudent),
      highestRank: payload && payload.highestRank
    });

    const submission = await submissionRepo.upsertFormSubmission(client, {
      playerId: player.id,
      submittedAt,
      sourceSheetRow: payload && payload.sourceSheetRow,
      sourceSheetName: payload && payload.sourceSheetName
    });

    const playDateIds = [];
    for (let i = 0; i < availableDates.length; i += 1) {
      const playDate = await submissionRepo.upsertPlayDate(client, availableDates[i]);
      if (playDate && playDate.id) {
        playDateIds.push(playDate.id);
      }
    }

    await submissionRepo.replaceSubmissionAvailableDates(client, submission.id, playDateIds);

    return {
      playerId: player.id,
      submissionId: submission.id,
      weekKey: getWeekKeyFromDate(submittedAt),
      availableDates
    };
  });
}

async function syncSubmissionsBatch(items) {
  const list = Array.isArray(items) ? items : [];
  const results = [];

  for (let i = 0; i < list.length; i += 1) {
    try {
      const synced = await syncSubmission(list[i]);
      results.push({
        ok: true,
        index: i,
        ...synced
      });
    } catch (error) {
      results.push({
        ok: false,
        index: i,
        error: error.message || String(error)
      });
    }
  }

  return {
    total: list.length,
    success: results.filter((x) => x.ok).length,
    failed: results.filter((x) => !x.ok).length,
    results
  };
}

module.exports = {
  syncSubmission,
  syncSubmissionsBatch
};
