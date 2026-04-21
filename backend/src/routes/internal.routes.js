const express = require('express');
const requireInternalApiKey = require('../middleware/requireInternalApiKey');
const submissionService = require('../services/submission.service');
const dashboardService = require('../services/dashboard.service');
const paymentService = require('../services/payment.service');

const router = express.Router();

router.use(requireInternalApiKey);

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

router.post('/sync-submission', asyncHandler(async (req, res) => {
  const result = await submissionService.syncSubmission(req.body || {});
  res.json({ ok: true, ...result });
}));

router.post('/sync-submissions-batch', asyncHandler(async (req, res) => {
  const result = await submissionService.syncSubmissionsBatch(req.body && req.body.items ? req.body.items : []);
  res.json({ ok: true, ...result });
}));

router.get('/weeks', asyncHandler(async (req, res) => {
  const weeks = await dashboardService.getWeeks();
  res.json({ ok: true, weeks });
}));

router.get('/week-requests', asyncHandler(async (req, res) => {
  const weekKey = String(req.query.weekKey || '').trim();
  const requests = await dashboardService.getWeekRequests(weekKey);
  res.json({ ok: true, weekKey, requests });
}));

router.post('/save-priorities', asyncHandler(async (req, res) => {
  const body = req.body || {};
  const result = await dashboardService.savePriorities(body.weekKey, body.items);
  res.json({ ok: true, ...result });
}));

router.post('/increment-selection-counts', asyncHandler(async (req, res) => {
  const body = req.body || {};
  const result = await dashboardService.incrementSelectionCounts({
    weekKey: body.weekKey,
    eventDate: body.eventDate,
    selectedItems: body.selectedItems,
    source: body.source
  });
  res.json({ ok: true, ...result });
}));

router.post('/create-payment', asyncHandler(async (req, res) => {
  const result = await paymentService.createPayment(req.body || {});
  res.json({ ok: true, ...result });
}));

router.post('/mark-payments-paid-manual', asyncHandler(async (req, res) => {
  const result = await paymentService.markPaymentsPaidManual(req.body || {});
  res.json({ ok: true, ...result });
}));

router.get('/payment-status-map', asyncHandler(async (req, res) => {
  const weekKey = String(req.query.weekKey || '').trim();
  const map = await paymentService.getPaymentStatusMapForWeek(weekKey);
  res.json({ ok: true, weekKey, map });
}));

router.get('/ready-group-mails', asyncHandler(async (req, res) => {
  const cooldownMinutes = Number(req.query.cooldownMinutes || req.query.cooldown || 2);
  const rows = await paymentService.getReadyGroupMails(cooldownMinutes);
  res.json({ ok: true, rows });
}));

router.post('/mark-mail-sent', asyncHandler(async (req, res) => {
  const result = await paymentService.markMailSent(req.body || {});
  res.json({ ok: true, ...result });
}));

module.exports = router;
