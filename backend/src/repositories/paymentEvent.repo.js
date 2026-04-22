const { connect } = require('../db/pool');
const PaymentEvent = require('../models/PaymentEvent');

async function insertPaymentEvent(session, input) {
  await connect();
  const doc = new PaymentEvent({
    paymentId: input.paymentId || null,
    orderCode: input.orderCode || null,
    eventType: String(input.eventType || 'unknown'),
    rawPayload: input.rawPayload || {}
  });

  return doc.save(session ? { session } : {});
}

module.exports = {
  insertPaymentEvent
};
