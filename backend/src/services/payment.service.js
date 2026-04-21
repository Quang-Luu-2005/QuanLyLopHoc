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

function generatePaymentCode(prefix) {
  const p = String(prefix || 'GE').replace(/[^a-zA-Z0-9]/g, '').toUpperCase() || 'GE';
  const token = `${Date.now()}${Math.floor(Math.random() * 900 + 100)}`;
  return `${p}${token}`.slice(0, 20);
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

async function resolvePlayer(client, payload) {
  if (payload.playerId) {
    const byId = await playerRepo.getPlayerById(client, payload.playerId);
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

  return playerRepo.upsertPlayer(client, {
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

  return withTransaction(async (client) => {
    const player = await resolvePlayer(client, payload);
    const latestSubmission = payload.submissionId
      ? { id: Number(payload.submissionId) }
      : await submissionRepo.getLatestSubmissionForPlayerWeek(client, player.id, weekKey);

    const orderCode = await generateUniqueOrderCode();
    const paymentCode = String(payload.paymentCode || generatePaymentCode(process.env.PAYMENT_CODE_PREFIX || 'GE'));
    const description = String(payload.description || paymentCode).trim().slice(0, 64);

    const returnUrl = String(process.env.PAYOS_RETURN_URL || '').trim() || 'https://payos.vn';
    const cancelUrl = String(process.env.PAYOS_CANCEL_URL || '').trim() || 'https://payos.vn';

    const payosData = await payos.createPaymentLink({
      orderCode,
      amount,
      description,
      buyerName: payload.buyerName || player.ingame_name,
      buyerEmail: payload.buyerEmail || player.email,
      returnUrl,
      cancelUrl
    });

    const existing = await paymentRepo.getLatestPaymentByPlayerWeekEvent(client, player.id, weekKey, eventDate);

    let payment;
    if (existing) {
      payment = await paymentRepo.updatePaymentById(client, existing.id, {
        submission_id: latestSubmission ? latestSubmission.id : null,
        order_code: Number(payosData.orderCode || orderCode),
        payment_code: paymentCode,
        payment_link_id: payosData.paymentLinkId || null,
        checkout_url: payosData.checkoutUrl || null,
        qr_code: payosData.qrCode || null,
        amount,
        payment_status: 'pending',
        need_payment: true,
        group_link: payload.groupLink || existing.group_link || null,
        support_message: payload.supportMessage || existing.support_message || null,
        last_error: null
      });
    } else {
      payment = await paymentRepo.insertPayment(client, {
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
      orderCode: Number(payment.order_code),
      paymentLinkId: payment.payment_link_id || '',
      checkoutUrl: payment.checkout_url || '',
      qrCode: payment.qr_code || '',
      amount: Number(payment.amount || amount),
      paymentCode: payment.payment_code || paymentCode
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

  await withTransaction(async (client) => {
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

      const player = await resolvePlayer(client, {
        email,
        ingameName: item.ingame || item.name,
        buyerName: item.name,
        isStudent: false,
        highestRank: item.rank
      });

      const existing = await paymentRepo.getLatestPaymentByPlayerWeekEvent(client, player.id, weekKey, eventDate);
      const currentCode = normalizeStatusCodeFromPaymentRow(existing);

      if (currentCode === 'PAID' || currentCode === 'LINK_SENT') {
        alreadyPaidEmails.push(email);
        continue;
      }

      if (existing) {
        await paymentRepo.updatePaymentById(client, existing.id, {
          payment_status: 'paid',
          paid_at: new Date(),
          paid_amount: amount,
          paid_content: 'MANUAL_UI_UPDATE',
          payment_ref: 'MANUAL_UI',
          group_link: payload.zaloLink || existing.group_link || null,
          support_message: payload.supportMessage || existing.support_message || null,
          last_error: null
        });
      } else {
        const orderCode = await generateUniqueOrderCode();
        await paymentRepo.insertPayment(client, {
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
  const mins = Number(cooldownMinutes || 2);
  return paymentRepo.listReadyGroupMails(Number.isNaN(mins) ? 2 : Math.max(0, mins));
}

async function markMailSent(payload) {
  const paymentId = Number(payload && payload.paymentId);
  if (!paymentId) {
    const err = new Error('paymentId is required');
    err.statusCode = 400;
    throw err;
  }

  const success = payload && payload.success !== false;
  const updated = await withTransaction(async (client) => {
    if (success) {
      return paymentRepo.updatePaymentById(client, paymentId, {
        group_mail_sent_at: new Date(),
        last_mail_at: new Date(),
        last_error: null
      });
    }

    return paymentRepo.updatePaymentById(client, paymentId, {
      last_mail_at: new Date(),
      last_error: String((payload && payload.error) || 'MAIL_SEND_FAILED')
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

  return withTransaction(async (client) => {
    const payment = await paymentRepo.findPaymentByOrderOrLink(fields.orderCode, fields.paymentLinkId);

    await paymentEventRepo.insertPaymentEvent(client, {
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
      payment_status: mappedStatus,
      payment_ref: fields.reference || payment.payment_ref || null,
      paid_content: fields.description || payment.paid_content || null,
      paid_amount: fields.amount || payment.paid_amount || null,
      last_error: mappedStatus === 'paid' ? null : payment.last_error
    };

    if (mappedStatus === 'paid' && !payment.paid_at) {
      patch.paid_at = new Date();
    }

    if (fields.paymentLinkId) {
      patch.payment_link_id = String(fields.paymentLinkId);
    }
    if (fields.orderCode) {
      patch.order_code = Number(fields.orderCode);
    }

    const updated = await paymentRepo.updatePaymentById(client, payment.id, patch);

    return {
      matched: true,
      paymentId: payment.id,
      orderCode: Number(updated.order_code),
      paymentStatus: updated.payment_status,
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
  markMailSent,
  processPayosWebhook,
  listPayments,
  getPaymentByOrderCode
};
