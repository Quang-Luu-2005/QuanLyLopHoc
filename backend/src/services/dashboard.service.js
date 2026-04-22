const { withTransaction } = require('../db/pool');
const submissionRepo = require('../repositories/submission.repo');
const priorityRepo = require('../repositories/priority.repo');
const selectionCountRepo = require('../repositories/selectionCount.repo');
const paymentRepo = require('../repositories/payment.repo');
const playerRepo = require('../repositories/player.repo');
const pairingRepo = require('../repositories/pairing.repo');
const { toDateOnly, formatDateOnly } = require('../utils/date');

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function formatWeekLabel(weekKey) {
  const start = toDateOnly(weekKey);
  if (!start) {
    return String(weekKey || '');
  }

  const end = new Date(start.getTime());
  end.setUTCDate(end.getUTCDate() + 6);

  const format = (date) => {
    const d = String(date.getUTCDate()).padStart(2, '0');
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const y = String(date.getUTCFullYear());
    return `${d}/${m}/${y}`;
  };

  return `Tuần ${format(start)} - ${format(end)}`;
}

function formatDateTimeVi(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: process.env.APP_TIMEZONE || 'Asia/Ho_Chi_Minh',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date).replace(',', '');
}

function paymentLabelFromCode(code) {
  const value = String(code || '').toUpperCase();
  if (value === 'PAID' || value === 'LINK_SENT') {
    return 'Đã thanh toán';
  }
  if (value === 'FAILED') {
    return 'Thanh toán thất bại';
  }
  return 'Chưa thanh toán';
}

function mapPaymentCodeFromRow(row) {
  return paymentRepo.mapPaymentStatusCode(row);
}

function normalizePairingStatus(value) {
  const status = String(value || 'DRAFT').trim().toUpperCase();
  return status === 'SENT' ? 'SENT' : 'DRAFT';
}

function sanitizePairingPlayer(item) {
  const row = item || {};
  const email = normalizeEmail(row.email);
  if (!email) {
    return null;
  }

  const playerId = row.playerId ? String(row.playerId).trim() : '';
  const submissionId = row.submissionId ? String(row.submissionId).trim() : '';
  const ingame = String(row.ingame || row.name || '').trim();
  const rank = String(row.rank || '').trim();

  return {
    playerId: playerId || null,
    submissionId: submissionId || null,
    email,
    name: String(row.name || '').trim() || null,
    ingame: ingame || null,
    rank: rank || null,
    paymentRequired: !!row.paymentRequired,
    priority: !!row.priority
  };
}

function buildPairId(pair, a, b, index) {
  const rawPairId = String(pair && pair.pairId ? pair.pairId : '').trim();
  if (rawPairId) {
    return rawPairId;
  }

  const sortedEmails = [a.email, b.email].sort();
  return `${sortedEmails[0]}__${sortedEmails[1]}__${index + 1}`;
}

function sanitizePairings(input) {
  const source = Array.isArray(input) ? input : [];
  const out = [];
  const seenEmails = {};

  for (let i = 0; i < source.length; i += 1) {
    const pair = source[i] || {};
    const a = sanitizePairingPlayer(pair.a);
    const b = sanitizePairingPlayer(pair.b);
    if (!a || !b || a.email === b.email) {
      continue;
    }
    if (seenEmails[a.email] || seenEmails[b.email]) {
      continue;
    }

    const rank = String(pair.rank || a.rank || b.rank || '').trim() || 'Không rõ';
    const pairNo = out.length + 1;
    const pairId = buildPairId(pair, a, b, pairNo - 1);
    seenEmails[a.email] = true;
    seenEmails[b.email] = true;

    out.push({
      pairId,
      pairNo,
      rank,
      a: {
        ...a,
        rank: rank
      },
      b: {
        ...b,
        rank: rank
      }
    });
  }

  return out;
}

function toPairingResponse(plan, fallbackWeekKey, fallbackEventDate) {
  const weekKey = String((plan && plan.weekKey) || fallbackWeekKey || '');
  const eventDate = String((plan && plan.eventDate) || fallbackEventDate || '');
  const status = normalizePairingStatus(plan && plan.status);
  const rawPairs = Array.isArray(plan && plan.pairs) ? plan.pairs : [];
  const pairs = sanitizePairings(rawPairs);
  const selectedMap = {};

  pairs.forEach((pair) => {
    selectedMap[pair.a.email] = true;
    selectedMap[pair.b.email] = true;
  });

  return {
    weekKey,
    eventDate,
    status,
    pairCount: pairs.length,
    pairs,
    selectedEmails: Object.keys(selectedMap),
    sentAt: plan && plan.sentAt ? new Date(plan.sentAt).toISOString() : null,
    updatedAt: plan && plan.updatedAt ? new Date(plan.updatedAt).toISOString() : null
  };
}

async function getWeeks() {
  const weeks = await submissionRepo.listWeekKeys();
  return weeks.map((weekKey) => {
    const key = formatDateOnly(weekKey);
    return {
      key,
      label: formatWeekLabel(key)
    };
  });
}

async function getWeekRequests(weekKey) {
  const key = formatDateOnly(weekKey);
  if (!key) {
    return [];
  }

  const [submissions, prioritiesMap, countMap, paymentRows] = await Promise.all([
    submissionRepo.listWeekLatestSubmissions(key),
    priorityRepo.listWeekPriorities(null, key),
    selectionCountRepo.listSelectionCountMap(),
    paymentRepo.getWeekPaymentStatusRows(key)
  ]);

  const paymentMap = {};
  paymentRows.forEach((row) => {
    const emailKey = normalizeEmail(row.email);
    const code = mapPaymentCodeFromRow(row);
    paymentMap[emailKey] = {
      code,
      label: paymentLabelFromCode(code)
    };
  });

  const rows = submissions.map((row) => {
    const email = normalizeEmail(row.email);
    const paymentRequired = !row.isStudent;
    const paymentInfo = paymentMap[email] || { code: 'PENDING', label: 'Chưa thanh toán' };

    return {
      playerId: row.playerId,
      submissionId: row.submissionId,
      email,
      name: row.ingameName,
      ingame: row.ingameName,
      priority: !!prioritiesMap[email],
      selectedCount: Number(countMap[email] || 0),
      requestedAt: formatDateTimeVi(row.submittedAt),
      requestedAtEpoch: new Date(row.submittedAt).getTime(),
      rankRaw: row.highestRank || '',
      rankNormalized: row.highestRank || 'Không rõ',
      availableDates: Array.isArray(row.availableDates) ? row.availableDates : [],
      studentStatusRaw: row.isStudent ? 'hoc vien' : 'khong hoc vien',
      paymentRequired,
      paymentStatusCode: paymentRequired ? paymentInfo.code : 'NONE',
      paymentStatus: paymentRequired ? paymentInfo.label : '-'
    };
  });

  rows.sort((a, b) => {
    if (Number(!!b.priority) !== Number(!!a.priority)) {
      return Number(!!b.priority) - Number(!!a.priority);
    }
    if (Number(a.selectedCount || 0) !== Number(b.selectedCount || 0)) {
      return Number(a.selectedCount || 0) - Number(b.selectedCount || 0);
    }
    return Number(a.requestedAtEpoch || 0) - Number(b.requestedAtEpoch || 0);
  });

  return rows;
}

async function savePriorities(weekKey, items) {
  const key = formatDateOnly(weekKey);
  if (!key) {
    const err = new Error('weekKey is required');
    err.statusCode = 400;
    throw err;
  }

  const list = Array.isArray(items) ? items : [];
  const priorityEmails = [];
  const seen = {};

  for (let i = 0; i < list.length; i += 1) {
    if (!list[i] || !list[i].priority) {
      continue;
    }

    const email = normalizeEmail(list[i].email);
    if (!email || seen[email]) {
      continue;
    }

    seen[email] = true;
    priorityEmails.push(email);
  }

  const prioritized = await withTransaction(async (client) => {
    return priorityRepo.saveWeekPriorities(client, key, priorityEmails);
  });

  return {
    updated: list.length,
    prioritized
  };
}

async function incrementSelectionCounts({ weekKey, eventDate, selectedItems, source }) {
  const key = formatDateOnly(weekKey);
  const event = formatDateOnly(eventDate);
  if (!key || !event) {
    const err = new Error('weekKey and eventDate are required');
    err.statusCode = 400;
    throw err;
  }

  const items = Array.isArray(selectedItems) ? selectedItems : [];

  return withTransaction(async (client) => {
    const dedup = await selectionCountRepo.listSelectionDedupMap(client, key, event);
    const rows = [];
    const countedEmails = [];
    let skipped = 0;

    for (let i = 0; i < items.length; i += 1) {
      const item = items[i] || {};
      const email = normalizeEmail(item.email);
      if (!email) {
        skipped += 1;
        continue;
      }

      if (dedup[email]) {
        skipped += 1;
        continue;
      }

      dedup[email] = true;
      countedEmails.push(email);
      rows.push({
        weekKey: key,
        eventDate: event,
        email,
        name: item.name || '',
        ingame: item.ingame || item.name || '',
        rank: item.rank || '',
        source: source || 'MANUAL'
      });
    }

    const added = await selectionCountRepo.insertSelectionCountLogs(client, rows);

    return {
      added,
      skipped,
      countedEmails
    };
  });
}

async function getPairingPlan(weekKey, eventDate) {
  const key = formatDateOnly(weekKey);
  const event = formatDateOnly(eventDate);
  if (!key || !event) {
    return null;
  }

  const plan = await pairingRepo.getPairingPlan(null, key, event);
  return toPairingResponse(plan, key, event);
}

async function savePairingPlan({ weekKey, eventDate, status, pairs }) {
  const key = formatDateOnly(weekKey);
  const event = formatDateOnly(eventDate);
  if (!key || !event) {
    const err = new Error('weekKey and eventDate are required');
    err.statusCode = 400;
    throw err;
  }

  const normalizedStatus = normalizePairingStatus(status);
  const normalizedPairs = sanitizePairings(pairs);

  const plan = await withTransaction(async (client) => {
    return pairingRepo.upsertPairingPlan(client, {
      weekKey: key,
      eventDate: event,
      status: normalizedStatus,
      pairs: normalizedPairs,
      sentAt: normalizedStatus === 'SENT' ? new Date() : null
    });
  });

  return toPairingResponse(plan, key, event);
}

async function deletePairFromPairingPlan({ weekKey, eventDate, pairId }) {
  const key = formatDateOnly(weekKey);
  const event = formatDateOnly(eventDate);
  const targetPairId = String(pairId || '').trim();
  if (!key || !event || !targetPairId) {
    const err = new Error('weekKey, eventDate and pairId are required');
    err.statusCode = 400;
    throw err;
  }

  return withTransaction(async (client) => {
    const current = await pairingRepo.getPairingPlan(client, key, event);
    if (!current) {
      const err = new Error('Pairing plan not found');
      err.statusCode = 404;
      throw err;
    }

    const list = Array.isArray(current.pairs) ? current.pairs : [];
    const filtered = list.filter((pair) => {
      const id = String(pair && pair.pairId ? pair.pairId : '').trim();
      return id !== targetPairId;
    });
    if (filtered.length === list.length) {
      const err = new Error('Pair not found');
      err.statusCode = 404;
      throw err;
    }

    const normalizedPairs = sanitizePairings(filtered);
    const updated = await pairingRepo.upsertPairingPlan(client, {
      weekKey: key,
      eventDate: event,
      status: 'DRAFT',
      pairs: normalizedPairs,
      sentAt: null
    });

    return toPairingResponse(updated, key, event);
  });
}

async function removeWeekRegistration({ weekKey, email }) {
  const key = formatDateOnly(weekKey);
  const normalizedEmail = normalizeEmail(email);
  if (!key || !normalizedEmail) {
    const err = new Error('weekKey and email are required');
    err.statusCode = 400;
    throw err;
  }

  return withTransaction(async (client) => {
    const player = await playerRepo.getPlayerByEmail(client, normalizedEmail);
    const deletedSubmissions = player && player.id
      ? await submissionRepo.deleteWeekSubmissionsByPlayer(client, key, player.id)
      : 0;
    const deletedPriorities = await priorityRepo.deleteWeekPriorityByEmail(client, key, normalizedEmail);
    const pairingCleanup = await pairingRepo.removeEmailFromWeekPairings(client, key, normalizedEmail);

    return {
      weekKey: key,
      email: normalizedEmail,
      deletedSubmissions,
      deletedPriorities,
      affectedPairingPlans: Number(pairingCleanup.affectedPlans || 0),
      deletedPairs: Number(pairingCleanup.removedPairs || 0)
    };
  });
}

module.exports = {
  getWeeks,
  getWeekRequests,
  savePriorities,
  incrementSelectionCounts,
  getPairingPlan,
  savePairingPlan,
  deletePairFromPairingPlan,
  removeWeekRegistration,
  paymentLabelFromCode
};
