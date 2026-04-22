const { withTransaction } = require('../db/pool');
const payos = require('../config/payos');
const playerRepo = require('../repositories/player.repo');
const submissionRepo = require('../repositories/submission.repo');
const paymentRepo = require('../repositories/payment.repo');
const paymentEventRepo = require('../repositories/paymentEvent.repo');
const { formatDateOnly } = require('../utils/date');

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeStatusCodeFromPaymentRow(row) {
  return paymentRepo.mapPaymentStatusCode(row);
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

function getPaymentAmount(raw) {
  const amount = Number(raw || 0);
  if (!amount || amount < 1000) {
    return 50000;
  }
  return Math.round(amount);
}

function getPaymentDeadlineHour() {
  const hour = Number(process.env.PAYMENT_DEADLINE_HOUR || 18);
  if (Number.isNaN(hour)) {
    return 18;
  }
  return Math.max(0, Math.min(23, Math.floor(hour)));
}

function parseDateOnlyParts(value) {
  const match = String(value || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3])
  };
}

function getTimeZoneOffsetMs(date, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  const parts = formatter.formatToParts(date).reduce((acc, item) => {
    if (item.type !== 'literal') {
      acc[item.type] = item.value;
    }
    return acc;
  }, {});

  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );

  return asUtc - date.getTime();
}

function toUnixFromTimeZoneLocal(localParts, timeZone) {
  const utcGuess = Date.UTC(
    Number(localParts.year),
    Number(localParts.month) - 1,
    Number(localParts.day),
    Number(localParts.hour || 0),
    Number(localParts.minute || 0),
    Number(localParts.second || 0)
  );

  const firstPass = utcGuess - getTimeZoneOffsetMs(new Date(utcGuess), timeZone);
  const refined = utcGuess - getTimeZoneOffsetMs(new Date(firstPass), timeZone);
  return Math.floor(refined / 1000);
}

function buildPaymentExpiredAt(eventDate) {
  const parts = parseDateOnlyParts(eventDate);
  if (!parts) {
    return null;
  }

  const deadlineHour = getPaymentDeadlineHour();
  const appTimeZone = String(process.env.APP_TIMEZONE || 'Asia/Ho_Chi_Minh').trim() || 'Asia/Ho_Chi_Minh';

  try {
    return toUnixFromTimeZoneLocal({
      year: parts.year,
      month: parts.month,
      day: parts.day,
      hour: deadlineHour,
      minute: 0,
      second: 0
    }, appTimeZone);
  } catch (err) {
    // Fallback cho timezone VN (UTC+7) khi môi trường không hỗ trợ Intl timezone.
    return Math.floor(Date.UTC(parts.year, parts.month - 1, parts.day, deadlineHour - 7, 0, 0) / 1000);
  }
}

function generatePaymentCode(prefix) {
  const p = String(prefix || 'GE').replace(/[^a-zA-Z0-9]/g, '').toUpperCase() || 'GE';
  const token = `${Date.now()}${Math.floor(Math.random() * 900 + 100)}`;
  return `${p}${token}`.slice(0, 20);
}

function normalizePayosDescription(rawDescription, fallback) {
  const text = String(rawDescription || '').trim();
  if (text) {
    return text.slice(0, 25);
  }
  return String(fallback || '').trim().slice(0, 25);
}

async function generateUniqueOrderCode() {
  for (let i = 0; i < 12; i += 1) {
    const orderCode = Number(`${Date.now()}${Math.floor(Math.random() * 900 + 100)}`);
    const existed = await paymentRepo.getPaymentByOrderCode(orderCode);
    if (!existed) {
      return orderCode;
    }
  }

  const err = new Error('Cannot generate unique order code');
  err.statusCode = 500;
  throw err;
}

async function resolvePlayer(session, payload) {
  if (payload.playerId) {
    const byId = await playerRepo.getPlayerById(session, payload.playerId);
    if (byId) {
      return byId;
    }
  }

  const email = normalizeEmail(payload.email || payload.buyerEmail);
  if (!email) {
    const err = new Error('playerId or email is required');
    err.statusCode = 400;
    throw err;
  }

  const ingameName = String(payload.ingameName || payload.buyerName || email.split('@')[0]).trim();

  return playerRepo.upsertPlayer(session, {
    email,
    ingameName,
    isStudent: !!payload.isStudent,
    highestRank: payload.highestRank,
    zaloPhone: payload.zaloPhone
  });
}

async function createPayment(payload) {
  const weekKey = formatDateOnly(payload.weekKey);
  const eventDate = formatDateOnly(payload.eventDate);
  if (!weekKey || !eventDate) {
    const err = new Error('weekKey and eventDate are required');
    err.statusCode = 400;
    throw err;
  }

  const amount = getPaymentAmount(payload.amount);

  return withTransaction(async (session) => {
    const player = await resolvePlayer(session, payload);
    const latestSubmission = payload.submissionId
      ? { id: String(payload.submissionId) }
      : await submissionRepo.getLatestSubmissionForPlayerWeek(session, player.id, weekKey);

    const orderCode = await generateUniqueOrderCode();
    const paymentCode = String(payload.paymentCode || generatePaymentCode(process.env.PAYMENT_CODE_PREFIX || 'GE'));
    const description = normalizePayosDescription(payload.description, paymentCode);
    const expiredAt = buildPaymentExpiredAt(eventDate);
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (expiredAt && expiredAt <= nowSeconds) {
      const err = new Error(`Đã quá hạn thanh toán (trước ${getPaymentDeadlineHour()}:00 ngày thi đấu).`);
      err.statusCode = 400;
      throw err;
    }

    const returnUrl = String(process.env.PAYOS_RETURN_URL || '').trim() || 'https://payos.vn';
    const cancelUrl = String(process.env.PAYOS_CANCEL_URL || '').trim() || 'https://payos.vn';

    const payosData = await payos.createPaymentLink({
      orderCode,
      amount,
      description,
      buyerName: payload.buyerName || player.ingameName,
      buyerEmail: payload.buyerEmail || player.email,
      returnUrl,
      cancelUrl,
      expiredAt
    });

    const existing = await paymentRepo.getLatestPaymentByPlayerWeekEvent(session, player.id, weekKey, eventDate);

    let payment;
    if (existing) {
      payment = await paymentRepo.updatePaymentById(session, existing.id, {
        submissionId: latestSubmission ? latestSubmission.id : null,
        orderCode: Number(payosData.orderCode || orderCode),
        paymentCode,
        paymentLinkId: payosData.paymentLinkId || null,
        checkoutUrl: payosData.checkoutUrl || null,
        qrCode: payosData.qrCode || null,
        amount,
        paymentStatus: 'pending',
        needPayment: true,
        groupLink: payload.groupLink || existing.groupLink || null,
        supportMessage: payload.supportMessage || existing.supportMessage || null,
        lastError: null
      });
    } else {
      payment = await paymentRepo.insertPayment(session, {
        playerId: player.id,
        submissionId: latestSubmission ? latestSubmission.id : null,
        weekKey,
        eventDate,
        orderCode: Number(payosData.orderCode || orderCode),
        paymentCode,
        paymentLinkId: payosData.paymentLinkId || '',
        checkoutUrl: payosData.checkoutUrl || '',
        qrCode: payosData.qrCode || '',
        amount,
        paymentStatus: 'pending',
        needPayment: true,
        groupLink: payload.groupLink || null,
        supportMessage: payload.supportMessage || null
      });
    }

    return {
      paymentId: payment.id,
      playerId: player.id,
      submissionId: latestSubmission ? latestSubmission.id : null,
      orderCode: Number(payment.orderCode),
      paymentLinkId: payment.paymentLinkId || '',
      checkoutUrl: payment.checkoutUrl || '',
      qrCode: payment.qrCode || '',
      amount: Number(payment.amount || amount),
      paymentCode: payment.paymentCode || paymentCode,
      expiredAt: expiredAt || null
    };
  });
}

async function markPaymentsPaidManual(payload) {
  const weekKey = formatDateOnly(payload.weekKey);
  const eventDate = formatDateOnly(payload.eventDate);
  if (!weekKey || !eventDate) {
    const err = new Error('weekKey and eventDate are required');
    err.statusCode = 400;
    throw err;
  }

  const selected = Array.isArray(payload.selected) ? payload.selected : [];
  if (!selected.length) {
    const err = new Error('selected is required');
    err.statusCode = 400;
    throw err;
  }

  const amount = getPaymentAmount(payload.amount);
  const paidUpdatedEmails = [];
  const alreadyPaidEmails = [];
  const seen = {};
  let skippedNoPaymentNeeded = 0;
  let skippedInvalid = 0;

  await withTransaction(async (session) => {
    for (let i = 0; i < selected.length; i += 1) {
      const item = selected[i] || {};
      const email = normalizeEmail(item.email);

      if (!email) {
        skippedInvalid += 1;
        continue;
      }
      if (seen[email]) {
        continue;
      }
      seen[email] = true;

      if (item.paymentRequired === false) {
        skippedNoPaymentNeeded += 1;
        continue;
      }

      const player = await resolvePlayer(session, {
        email,
        ingameName: item.ingame || item.name,
        buyerName: item.name,
        isStudent: false,
        highestRank: item.rank
      });

      const existing = await paymentRepo.getLatestPaymentByPlayerWeekEvent(session, player.id, weekKey, eventDate);
      const currentCode = normalizeStatusCodeFromPaymentRow(existing);

      if (currentCode === 'PAID' || currentCode === 'LINK_SENT') {
        alreadyPaidEmails.push(email);
        continue;
      }

      if (existing) {
        await paymentRepo.updatePaymentById(session, existing.id, {
          paymentStatus: 'paid',
          paidAt: new Date(),
          paidAmount: amount,
          paidContent: 'MANUAL_UI_UPDATE',
          paymentRef: 'MANUAL_UI',
          groupLink: payload.zaloLink || existing.groupLink || null,
          supportMessage: payload.supportMessage || existing.supportMessage || null,
          lastError: null
        });
      } else {
        const orderCode = await generateUniqueOrderCode();
        await paymentRepo.insertPayment(session, {
          playerId: player.id,
          submissionId: null,
          weekKey,
          eventDate,
          orderCode,
          paymentCode: generatePaymentCode(process.env.PAYMENT_CODE_PREFIX || 'GE'),
          paymentLinkId: '',
          checkoutUrl: '',
          qrCode: '',
          amount,
          paidAmount: amount,
          paymentStatus: 'paid',
          paymentRef: 'MANUAL_UI',
          paidContent: 'MANUAL_UI_UPDATE',
          needPayment: true,
          groupLink: payload.zaloLink || null,
          supportMessage: payload.supportMessage || null,
          paidAt: new Date(),
          lastError: null
        });
      }

      paidUpdatedEmails.push(email);
    }
  });

  return {
    totalSelected: selected.length,
    candidates: Object.keys(seen).length,
    paidUpdated: paidUpdatedEmails.length,
    sentGroup: 0,
    skippedInvalid,
    skippedDuplicate: selected.length - Object.keys(seen).length - skippedInvalid,
    skippedNoPaymentNeeded,
    skippedAlreadySent: alreadyPaidEmails.length,
    paidUpdatedEmails,
    sentGroupEmails: [],
    skippedAlreadySentEmails: alreadyPaidEmails,
    alreadyPaidEmails,
    errors: 0,
    eventDate
  };
}

async function getPaymentStatusMapForWeek(weekKey) {
  const key = formatDateOnly(weekKey);
  if (!key) {
    return {};
  }

  const rows = await paymentRepo.getWeekPaymentStatusRows(key);
  const map = {};

  rows.forEach((row) => {
    const code = normalizeStatusCodeFromPaymentRow(row);
    map[normalizeEmail(row.email)] = {
      code,
      label: paymentLabelFromCode(code)
    };
  });

  return map;
}

async function getReadyGroupMails(cooldownMinutes) {
  const mins = Number(cooldownMinutes);
  return paymentRepo.listReadyGroupMails(Number.isNaN(mins) ? 0 : Math.max(0, mins));
}

async function markPaymentPaidFromWebhook(payload) {
  const paymentId = String((payload && payload.paymentId) || '').trim();
  const orderCodeRaw = payload && payload.orderCode !== undefined ? payload.orderCode : null;
  const orderCode = Number(orderCodeRaw || 0);
  const paidAmount = Number((payload && payload.paidAmount) || 0);
  const paymentRef = String((payload && payload.paymentRef) || '').trim();
  const paidContent = String((payload && payload.paidContent) || '').trim();

  if (!paymentId && !orderCode) {
    const err = new Error('paymentId or orderCode is required');
    err.statusCode = 400;
    throw err;
  }

  return withTransaction(async (session) => {
    let payment = null;

    if (paymentId) {
      payment = await paymentRepo.getPaymentById(session, paymentId);
    }
    if (!payment && orderCode) {
      payment = await paymentRepo.getPaymentByOrderCodeRaw(session, orderCode);
    }

    if (!payment) {
      return {
        matched: false,
        ignored: true,
        reason: 'PAYMENT_NOT_FOUND'
      };
    }

    const patch = {
      paymentStatus: 'paid',
      lastError: null
    };

    if (!payment.paidAt) {
      patch.paidAt = new Date();
    }
    if (orderCode) {
      patch.orderCode = Number(orderCode);
    }
    if (paidAmount > 0) {
      patch.paidAmount = Math.round(paidAmount);
    }
    if (paymentRef) {
      patch.paymentRef = paymentRef;
    }
    if (paidContent) {
      patch.paidContent = paidContent;
    }

    const updated = await paymentRepo.updatePaymentById(session, payment.id, patch);

    return {
      matched: true,
      paymentId: updated.id,
      orderCode: Number(updated.orderCode || orderCode || 0),
      paymentStatus: updated.paymentStatus,
      paymentStatusCode: normalizeStatusCodeFromPaymentRow(updated)
    };
  });
}

async function markMailSent(payload) {
  const paymentId = String((payload && payload.paymentId) || '').trim();
  if (!paymentId) {
    const err = new Error('paymentId is required');
    err.statusCode = 400;
    throw err;
  }

  const success = payload && payload.success !== false;
  const updated = await withTransaction(async (session) => {
    if (success) {
      const current = await paymentRepo.getPaymentById(session, paymentId);
      if (!current) {
        const err = new Error('Payment not found');
        err.statusCode = 404;
        throw err;
      }

      const patch = {
        paymentStatus: 'paid',
        groupMailSentAt: new Date(),
        lastMailAt: new Date(),
        lastError: null
      };
      if (!current.paidAt) {
        patch.paidAt = new Date();
      }

      return paymentRepo.updatePaymentById(session, paymentId, patch);
    }

    return paymentRepo.updatePaymentById(session, paymentId, {
      lastMailAt: new Date(),
      lastError: String((payload && payload.error) || 'MAIL_SEND_FAILED')
    });
  });

  return {
    paymentId,
    success,
    paymentStatusCode: normalizeStatusCodeFromPaymentRow(updated)
  };
}

function extractWebhookFields(payload) {
  const body = payload || {};
  const data = body && typeof body.data === 'object' ? body.data : {};

  const orderCode = data.orderCode || body.orderCode || null;
  const paymentLinkId = data.paymentLinkId || body.paymentLinkId || null;
  const reference = data.reference || data.transactionId || data.transaction_id || body.reference || null;
  const amount = Number(data.amount || data.transferAmount || body.amount || 0) || 0;
  const statusRaw = data.code || data.status || data.desc || body.code || body.desc || body.status || '';
  const description = data.description || data.transferContent || data.content || body.description || body.content || '';
  const successFlag = body.success === true || String(data.code || '') === '00' || String(body.code || '') === '00';

  return {
    data,
    orderCode,
    paymentLinkId,
    reference,
    amount,
    statusRaw,
    description,
    successFlag
  };
}

async function processPayosWebhook(payload) {
  payos.assertPayosConfig();

  const signatureOk = payos.verifyWebhookSignature(payload);
  if (!signatureOk) {
    const err = new Error('Invalid PayOS webhook signature');
    err.statusCode = 401;
    throw err;
  }

  const fields = extractWebhookFields(payload);
  const mappedStatus = fields.successFlag ? 'paid' : payos.mapPayosStatus(fields.statusRaw);

  return withTransaction(async (session) => {
    const payment = await paymentRepo.findPaymentByOrderOrLink(fields.orderCode, fields.paymentLinkId);

    await paymentEventRepo.insertPaymentEvent(session, {
      paymentId: payment ? payment.id : null,
      orderCode: fields.orderCode || null,
      eventType: mappedStatus,
      rawPayload: payload
    });

    if (!payment) {
      return {
        matched: false,
        ignored: true,
        reason: 'PAYMENT_NOT_FOUND'
      };
    }

    const patch = {
      paymentStatus: mappedStatus,
      paymentRef: fields.reference || payment.paymentRef || null,
      paidContent: fields.description || payment.paidContent || null,
      paidAmount: fields.amount || payment.paidAmount || null,
      lastError: mappedStatus === 'paid' ? null : payment.lastError
    };

    if (mappedStatus === 'paid' && !payment.paidAt) {
      patch.paidAt = new Date();
    }

    if (fields.paymentLinkId) {
      patch.paymentLinkId = String(fields.paymentLinkId);
    }
    if (fields.orderCode) {
      patch.orderCode = Number(fields.orderCode);
    }

    const updated = await paymentRepo.updatePaymentById(session, payment.id, patch);

    return {
      matched: true,
      paymentId: payment.id,
      orderCode: Number(updated.orderCode),
      paymentStatus: updated.paymentStatus,
      paymentStatusCode: normalizeStatusCodeFromPaymentRow(updated)
    };
  });
}

async function listPayments(filters) {
  return paymentRepo.listPayments(filters || {});
}

async function getPaymentByOrderCode(orderCode) {
  return paymentRepo.getPaymentByOrderCode(orderCode);
}

module.exports = {
  createPayment,
  markPaymentsPaidManual,
  getPaymentStatusMapForWeek,
  getReadyGroupMails,
  markPaymentPaidFromWebhook,
  markMailSent,
  processPayosWebhook,
  listPayments,
  getPaymentByOrderCode
};
