const { connect } = require('../db/pool');
const PairingPlan = require('../models/PairingPlan');

async function getPairingPlan(session, weekKey, eventDate) {
  await connect();
  const opts = {};
  if (session) opts.session = session;

  return PairingPlan.findOne(
    { weekKey: String(weekKey), eventDate: String(eventDate) },
    null,
    opts
  ).lean({ virtuals: true });
}

async function upsertPairingPlan(session, payload) {
  await connect();

  const opts = { new: true, upsert: true, setDefaultsOnInsert: true };
  if (session) opts.session = session;

  const update = {
    $set: {
      status: String(payload.status || 'DRAFT'),
      pairs: Array.isArray(payload.pairs) ? payload.pairs : []
    }
  };

  if (payload.sentAt === null) {
    update.$set.sentAt = null;
  } else if (payload.sentAt) {
    update.$set.sentAt = payload.sentAt;
  }

  return PairingPlan.findOneAndUpdate(
    { weekKey: String(payload.weekKey), eventDate: String(payload.eventDate) },
    update,
    opts
  ).lean({ virtuals: true });
}

async function removeEmailFromWeekPairings(session, weekKey, email) {
  await connect();
  const key = String(weekKey);
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) {
    return {
      affectedPlans: 0,
      removedPairs: 0
    };
  }

  const query = {
    weekKey: key,
    $or: [
      { 'pairs.a.email': normalizedEmail },
      { 'pairs.b.email': normalizedEmail }
    ]
  };
  const opts = {};
  if (session) opts.session = session;

  const plans = await PairingPlan.find(query, null, opts);
  let affectedPlans = 0;
  let removedPairs = 0;

  for (let i = 0; i < plans.length; i += 1) {
    const plan = plans[i];
    const before = Array.isArray(plan.pairs) ? plan.pairs.length : 0;
    const nextPairs = (plan.pairs || []).filter((pair) => {
      const emailA = String(pair?.a?.email || '').toLowerCase();
      const emailB = String(pair?.b?.email || '').toLowerCase();
      return emailA !== normalizedEmail && emailB !== normalizedEmail;
    });
    const after = nextPairs.length;

    if (after === before) {
      continue;
    }

    affectedPlans += 1;
    removedPairs += (before - after);
    plan.pairs = nextPairs.map((pair, index) => ({
      ...(pair && typeof pair.toObject === 'function' ? pair.toObject() : pair),
      pairNo: index + 1
    }));
    plan.status = 'DRAFT';
    plan.sentAt = null;
    await plan.save(session ? { session } : {});
  }

  return {
    affectedPlans,
    removedPairs
  };
}

module.exports = {
  getPairingPlan,
  upsertPairingPlan,
  removeEmailFromWeekPairings
};
