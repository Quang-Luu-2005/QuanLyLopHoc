const { pool } = require('../db/pool');

function runner(client) {
  return client || pool;
}

async function insertPaymentEvent(client, input) {
  const db = runner(client);
  const result = await db.query(
    `
      INSERT INTO payment_events (
        payment_id,
        order_code,
        event_type,
        raw_payload
      )
      VALUES ($1, $2, $3, $4::jsonb)
      RETURNING *
    `,
    [
      input.paymentId || null,
      input.orderCode || null,
      String(input.eventType || 'unknown'),
      JSON.stringify(input.rawPayload || {})
    ]
  );

  return result.rows[0] || null;
}

module.exports = {
  insertPaymentEvent
};
