const express = require('express');
const paymentService = require('../services/payment.service');

const router = express.Router();

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

router.post('/payos', asyncHandler(async (req, res) => {
  const result = await paymentService.processPayosWebhook(req.body || {});
  res.status(200).json({ ok: true, ...result });
}));

router.get('/payos', (req, res) => {
  res.status(200).json({ ok: true, message: 'PayOS webhook endpoint is ready' });
});

module.exports = router;
