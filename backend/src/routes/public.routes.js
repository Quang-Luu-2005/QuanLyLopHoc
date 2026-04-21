const express = require('express');
const playerRepo = require('../repositories/player.repo');
const dashboardService = require('../services/dashboard.service');
const paymentService = require('../services/payment.service');

const router = express.Router();

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

router.get('/health', asyncHandler(async (req, res) => {
  res.json({ ok: true, status: 'healthy', time: new Date().toISOString() });
}));

router.get('/api/weeks', asyncHandler(async (req, res) => {
  const weeks = await dashboardService.getWeeks();
  res.json({ ok: true, weeks });
}));

router.get('/api/players', asyncHandler(async (req, res) => {
  const players = await playerRepo.listPlayers({
    email: req.query.email
  });
  res.json({ ok: true, players });
}));

router.get('/api/submissions', asyncHandler(async (req, res) => {
  const weekKey = String(req.query.weekKey || '').trim();
  if (!weekKey) {
    const weeks = await dashboardService.getWeeks();
    return res.json({ ok: true, weekKey: '', submissions: [], weeks });
  }

  const submissions = await dashboardService.getWeekRequests(weekKey);
  return res.json({ ok: true, weekKey, submissions });
}));

router.get('/api/payments', asyncHandler(async (req, res) => {
  const rows = await paymentService.listPayments({
    status: req.query.status,
    email: req.query.email,
    date: req.query.date
  });
  res.json({ ok: true, payments: rows });
}));

router.get('/api/payments/:orderCode', asyncHandler(async (req, res) => {
  const row = await paymentService.getPaymentByOrderCode(req.params.orderCode);
  if (!row) {
    return res.status(404).json({ ok: false, error: 'Payment not found' });
  }
  return res.json({ ok: true, payment: row });
}));

module.exports = router;
