const express = require('express');
const paymentService = require('../services/payment.service');

const router = express.Router();

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

router.post('/payos', async (req, res, next) => {
  try {
    const result = await paymentService.processPayosWebhook(req.body || {});
    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    if (String(error && error.message || '').includes('Invalid PayOS webhook signature')) {
      return res.status(200).json({
        ok: true,
        ignored: true,
        reason: 'INVALID_SIGNATURE'
      });
    }
    return next(error);
  }
});

router.get('/payos', (req, res) => {
  res.status(200).json({ ok: true, message: 'PayOS webhook endpoint is ready' });
});

module.exports = router;
