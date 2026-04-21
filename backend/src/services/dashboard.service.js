const { withTransaction } = require('../db/pool');
const submissionRepo = require('../repositories/submission.repo');
const priorityRepo = require('../repositories/priority.repo');
const selectionCountRepo = require('../repositories/selectionCount.repo');
const paymentRepo = require('../repositories/payment.repo');
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

module.exports = {
  getWeeks,
  getWeekRequests,
  savePriorities,
  incrementSelectionCounts,
  paymentLabelFromCode
};
