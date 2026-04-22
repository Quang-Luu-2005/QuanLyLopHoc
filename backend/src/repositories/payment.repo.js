const { connect } = require('../db/pool');
const Payment = require('../models/Payment');
const { toDateOnly } = require('../utils/date');

function mapPaymentStatusCode(row) {
  if (!row) return 'PENDING';

  if (row.groupMailSentAt) return 'LINK_SENT';

  const status = String(row.paymentStatus || '').toLowerCase();
  if (status === 'paid') return 'PAID';
  if (status === 'failed' || status === 'expired' || status === 'cancelled') return 'FAILED';
  return 'PENDING';
}

async function getLatestPaymentByPlayerWeekEvent(session, playerId, weekKey, eventDate) {
  await connect();
  const weekDate = toDateOnly(weekKey);
  const eventDateObj = toDateOnly(eventDate);

  const opts = { sort: { updatedAt: -1, _id: -1 } };
  if (session) opts.session = session;

  return Payment.findOne({ playerId, weekKey: weekDate, eventDate: eventDateObj }, null, opts);
}

async function insertPayment(session, input) {
  await connect();
  const doc = new Payment({
    playerId: input.playerId,
    submissionId: input.submissionId || null,
    weekKey: toDateOnly(input.weekKey),
    eventDate: toDateOnly(input.eventDate),
    orderCode: Number(input.orderCode),
    paymentCode: input.paymentCode || null,
    paymentLinkId: input.paymentLinkId || null,
    checkoutUrl: input.checkoutUrl || null,
    qrCode: input.qrCode || null,
    amount: Number(input.amount),
    paidAmount: input.paidAmount || null,
    paymentStatus: input.paymentStatus || 'pending',
    paymentRef: input.paymentRef || null,
    paidContent: input.paidContent || null,
    needPayment: input.needPayment !== false,
    groupLink: input.groupLink || null,
    supportMessage: input.supportMessage || null,
    paidAt: input.paidAt || null,
    groupMailSentAt: input.groupMailSentAt || null,
    lastMailAt: input.lastMailAt || null,
    lastError: input.lastError || null
  });

  return doc.save(session ? { session } : {});
}

async function updatePaymentById(session, paymentId, patch) {
  await connect();
  const keys = Object.keys(patch || {});
  if (!keys.length) return null;

  const opts = { new: true };
  if (session) opts.session = session;

  return Payment.findByIdAndUpdate(paymentId, { $set: patch }, opts);
}

async function getWeekPaymentStatusRows(weekKey) {
  await connect();
  const weekDate = toDateOnly(weekKey);
  if (!weekDate) return [];

  const payments = await Payment.find({ weekKey: weekDate, needPayment: true })
    .populate('playerId', 'email ingameName')
    .sort({ updatedAt: -1, _id: -1 })
    .lean({ virtuals: true });

  function getScore(pay) {
    if (pay.groupMailSentAt) return 4;
    const s = String(pay.paymentStatus || '').toLowerCase();
    if (s === 'paid') return 3;
    if (s === 'pending') return 2;
    return 1;
  }

  payments.sort((a, b) => {
    const emailA = String(a.playerId?.email || '').toLowerCase();
    const emailB = String(b.playerId?.email || '').toLowerCase();
    if (emailA !== emailB) return emailA.localeCompare(emailB);
    const scoreDiff = getScore(b) - getScore(a);
    if (scoreDiff !== 0) return scoreDiff;
    return (b.updatedAt?.getTime() || 0) - (a.updatedAt?.getTime() || 0);
  });

  const seen = {};
  const result = [];
  for (const pay of payments) {
    const emailKey = String(pay.playerId?.email || '').toLowerCase();
    if (!emailKey || seen[emailKey]) continue;
    seen[emailKey] = true;
    result.push({
      ...pay,
      email: pay.playerId?.email,
      ingame_name: pay.playerId?.ingameName,
      email_key: emailKey
    });
  }
  return result;
}

async function findPaymentByOrderOrLink(orderCode, paymentLinkId) {
  await connect();
  const conditions = [];

  if (orderCode) conditions.push({ orderCode: Number(orderCode) });
  if (paymentLinkId) conditions.push({ paymentLinkId: String(paymentLinkId) });
  if (!conditions.length) return null;

  return Payment.findOne({ $or: conditions }).sort({ updatedAt: -1, _id: -1 });
}

async function listPayments(filters) {
  await connect();
  const query = {};

  if (filters && filters.status) {
    query.paymentStatus = String(filters.status).toLowerCase();
  }
  if (filters && filters.date) {
    const dateObj = toDateOnly(filters.date);
    if (dateObj) query.eventDate = dateObj;
  }

  let payments = await Payment.find(query)
    .populate('playerId', 'email ingameName')
    .sort({ createdAt: -1, _id: -1 })
    .limit(1000)
    .lean({ virtuals: true });

  if (filters && filters.email) {
    const emailFilter = String(filters.email).toLowerCase();
    payments = payments.filter((p) =>
      String(p.playerId?.email || '').toLowerCase().includes(emailFilter)
    );
  }

  return payments.map((p) => ({
    id: p.id,
    orderCode: p.orderCode,
    paymentLinkId: p.paymentLinkId,
    checkoutUrl: p.checkoutUrl,
    qrCode: p.qrCode,
    amount: p.amount,
    paidAmount: p.paidAmount,
    paymentStatus: p.paymentStatus,
    paymentRef: p.paymentRef,
    paymentCode: p.paymentCode,
    weekKey: p.weekKey,
    eventDate: p.eventDate,
    needPayment: p.needPayment,
    groupMailSentAt: p.groupMailSentAt,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    paidAt: p.paidAt,
    email: p.playerId?.email,
    ingameName: p.playerId?.ingameName
  }));
}

async function getPaymentByOrderCode(orderCode) {
  await connect();
  const payment = await Payment.findOne({ orderCode: Number(orderCode) })
    .populate('playerId', 'email ingameName')
    .lean({ virtuals: true });

  if (!payment) return null;

  return {
    ...payment,
    id: payment.id,
    email: payment.playerId?.email,
    ingameName: payment.playerId?.ingameName
  };
}

async function listReadyGroupMails(cooldownMinutes) {
  await connect();
  const cooldownMs = Number(cooldownMinutes || 2) * 60 * 1000;
  const cutoff = new Date(Date.now() - cooldownMs);

  const payments = await Payment.find({
    needPayment: true,
    paymentStatus: 'paid',
    groupMailSentAt: null,
    paidAt: { $ne: null, $lte: cutoff }
  })
    .populate('playerId', 'email ingameName')
    .sort({ paidAt: 1 })
    .limit(500)
    .lean({ virtuals: true });

  return payments.map((p) => ({
    id: p.id,
    weekKey: p.weekKey,
    eventDate: p.eventDate,
    groupLink: p.groupLink,
    supportMessage: p.supportMessage,
    paidAt: p.paidAt,
    email: p.playerId?.email,
    ingameName: p.playerId?.ingameName
  }));
}

module.exports = {
  mapPaymentStatusCode,
  getLatestPaymentByPlayerWeekEvent,
  insertPayment,
  updatePaymentById,
  getWeekPaymentStatusRows,
  findPaymentByOrderOrLink,
  listPayments,
  getPaymentByOrderCode,
  listReadyGroupMails
};
