const { connect } = require('../db/pool');
const FormSubmission = require('../models/FormSubmission');
const PlayDate = require('../models/PlayDate');
const { toDateOnly, formatDateOnly, getWeekKeyFromDate } = require('../utils/date');

async function upsertFormSubmission(session, input) {
  await connect();
  const sourceSheetRow = input.sourceSheetRow ? Number(input.sourceSheetRow) : null;
  const sourceSheetName = input.sourceSheetName ? String(input.sourceSheetName).trim() : null;
  const weekKey = getWeekKeyFromDate(input.submittedAt) || null;

  const opts = { new: true, setDefaultsOnInsert: true };
  if (session) opts.session = session;

  if (sourceSheetName !== null && sourceSheetRow !== null) {
    opts.upsert = true;
    return FormSubmission.findOneAndUpdate(
      { sourceSheetName, sourceSheetRow },
      {
        $set: { playerId: input.playerId, submittedAt: input.submittedAt, weekKey },
        $setOnInsert: { sourceSheetName, sourceSheetRow }
      },
      opts
    );
  }

  const doc = new FormSubmission({
    playerId: input.playerId,
    submittedAt: input.submittedAt,
    weekKey,
    sourceSheetRow,
    sourceSheetName
  });
  return doc.save(session ? { session } : {});
}

async function upsertPlayDate(session, playDate) {
  await connect();
  const dateObj = toDateOnly(playDate);
  if (!dateObj) return null;

  const opts = { new: true, upsert: true, setDefaultsOnInsert: true };
  if (session) opts.session = session;

  return PlayDate.findOneAndUpdate(
    { playDate: dateObj },
    { $setOnInsert: { playDate: dateObj } },
    opts
  );
}

async function replaceSubmissionAvailableDates(session, submissionId, playDateIds) {
  await connect();
  const opts = {};
  if (session) opts.session = session;

  await FormSubmission.findByIdAndUpdate(
    submissionId,
    { $set: { availableDateIds: playDateIds || [] } },
    opts
  );
}

async function listWeekKeys() {
  await connect();
  const result = await FormSubmission.distinct('weekKey');
  return result
    .filter(Boolean)
    .sort((a, b) => b.localeCompare(a))
    .slice(0, 120);
}

async function listWeekLatestSubmissions(weekKey) {
  await connect();

  const submissions = await FormSubmission.find({ weekKey: String(weekKey) })
    .populate('playerId', 'email ingameName isStudent highestRank')
    .populate('availableDateIds', 'playDate')
    .sort({ submittedAt: -1, _id: -1 })
    .lean({ virtuals: true });

  // Keep latest submission per email (already sorted desc, first = latest)
  const seen = {};
  const latest = [];
  for (const s of submissions) {
    const emailKey = String(s.playerId?.email || '').toLowerCase();
    if (!emailKey || seen[emailKey]) continue;
    seen[emailKey] = true;
    latest.push(s);
  }

  // Final sort: submitted_at ASC, email ASC
  latest.sort((a, b) => {
    const timeA = a.submittedAt?.getTime() || 0;
    const timeB = b.submittedAt?.getTime() || 0;
    if (timeA !== timeB) return timeA - timeB;
    return String(a.playerId?.email || '').localeCompare(String(b.playerId?.email || ''));
  });

  return latest.map((s) => ({
    submissionId: s.id,
    playerId: String(s.playerId?._id || s.playerId?.id || ''),
    submittedAt: s.submittedAt,
    email: s.playerId?.email,
    ingameName: s.playerId?.ingameName,
    isStudent: s.playerId?.isStudent,
    highestRank: s.playerId?.highestRank,
    availableDates: Array.isArray(s.availableDateIds)
      ? s.availableDateIds
        .map((item) => item && item.playDate ? formatDateOnly(item.playDate) : '')
        .filter(Boolean)
      : []
  }));
}

async function deleteWeekSubmissionsByPlayer(session, weekKey, playerId) {
  await connect();
  if (!weekKey || !playerId) {
    return 0;
  }

  const opts = {};
  if (session) opts.session = session;
  const result = await FormSubmission.deleteMany(
    { weekKey: String(weekKey), playerId },
    opts
  );
  return Number(result.deletedCount || 0);
}

async function getLatestSubmissionForPlayerWeek(session, playerId, weekKey) {
  await connect();
  const opts = { sort: { submittedAt: -1, _id: -1 } };
  if (session) opts.session = session;

  return FormSubmission.findOne(
    { playerId, weekKey: String(weekKey) },
    null,
    opts
  );
}

module.exports = {
  upsertFormSubmission,
  upsertPlayDate,
  replaceSubmissionAvailableDates,
  listWeekKeys,
  listWeekLatestSubmissions,
  getLatestSubmissionForPlayerWeek,
  deleteWeekSubmissionsByPlayer
};
