const { pool } = require('../db/pool');

function runner(client) {
  return client || pool;
}

function mapPaymentStatusCode(row) {
  if (!row) {
    return 'PENDING';
  }

  if (row.group_mail_sent_at) {
    return 'LINK_SENT';
  }

  const status = String(row.payment_status || '').toLowerCase();
  if (status === 'paid') {
    return 'PAID';
  }
  if (status === 'failed' || status === 'expired' || status === 'cancelled') {
    return 'FAILED';
  }
  return 'PENDING';
}

async function getLatestPaymentByPlayerWeekEvent(client, playerId, weekKey, eventDate) {
  const db = runner(client);
  const result = await db.query(
    `
      SELECT *
      FROM payments
      WHERE player_id = $1
        AND week_key = $2::date
        AND event_date = $3::date
      ORDER BY updated_at DESC, id DESC
      LIMIT 1
    `,
    [playerId, weekKey, eventDate]
  );

  return result.rows[0] || null;
}

async function insertPayment(client, input) {
  const db = runner(client);
  const result = await db.query(
    `
      INSERT INTO payments (
        player_id,
        submission_id,
        week_key,
        event_date,
        order_code,
        payment_code,
        payment_link_id,
        checkout_url,
        qr_code,
        amount,
        paid_amount,
        payment_status,
        payment_ref,
        paid_content,
        need_payment,
        group_link,
        support_message,
        paid_at,
        group_mail_sent_at,
        last_mail_at,
        last_error
      )
      VALUES (
        $1, $2, $3::date, $4::date, $5, $6, $7, $8, $9,
        $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21
      )
      RETURNING *
    `,
    [
      input.playerId,
      input.submissionId || null,
      input.weekKey,
      input.eventDate,
      Number(input.orderCode),
      input.paymentCode || null,
      input.paymentLinkId || null,
      input.checkoutUrl || null,
      input.qrCode || null,
      Number(input.amount),
      input.paidAmount || null,
      input.paymentStatus || 'pending',
      input.paymentRef || null,
      input.paidContent || null,
      input.needPayment !== false,
      input.groupLink || null,
      input.supportMessage || null,
      input.paidAt || null,
      input.groupMailSentAt || null,
      input.lastMailAt || null,
      input.lastError || null
    ]
  );

  return result.rows[0] || null;
}

async function updatePaymentById(client, paymentId, patch) {
  const db = runner(client);
  const keys = Object.keys(patch || {});
  if (!keys.length) {
    return null;
  }

  const sets = [];
  const values = [];

  keys.forEach((key) => {
    values.push(patch[key]);
    sets.push(`${key} = $${values.length}`);
  });

  values.push(paymentId);

  const result = await db.query(
    `
      UPDATE payments
      SET ${sets.join(', ')}, updated_at = NOW()
      WHERE id = $${values.length}
      RETURNING *
    `,
    values
  );

  return result.rows[0] || null;
}

async function getWeekPaymentStatusRows(weekKey) {
  const result = await pool.query(
    `
      SELECT DISTINCT ON (LOWER(p.email))
        LOWER(p.email) AS email_key,
        p.email,
        p.ingame_name,
        pay.*
      FROM payments pay
      JOIN players p ON p.id = pay.player_id
      WHERE pay.week_key = $1::date
        AND pay.need_payment = TRUE
      ORDER BY
        LOWER(p.email),
        CASE
          WHEN pay.group_mail_sent_at IS NOT NULL THEN 4
          WHEN pay.payment_status = 'paid' THEN 3
          WHEN pay.payment_status = 'pending' THEN 2
          ELSE 1
        END DESC,
        pay.updated_at DESC,
        pay.id DESC
    `,
    [weekKey]
  );

  return result.rows;
}

async function findPaymentByOrderOrLink(orderCode, paymentLinkId) {
  const where = [];
  const values = [];

  if (orderCode) {
    values.push(Number(orderCode));
    where.push(`order_code = $${values.length}`);
  }

  if (paymentLinkId) {
    values.push(String(paymentLinkId));
    where.push(`payment_link_id = $${values.length}`);
  }

  if (!where.length) {
    return null;
  }

  const result = await pool.query(
    `
      SELECT *
      FROM payments
      WHERE ${where.join(' OR ')}
      ORDER BY updated_at DESC, id DESC
      LIMIT 1
    `,
    values
  );

  return result.rows[0] || null;
}

async function listPayments(filters) {
  const values = [];
  const where = [];

  if (filters && filters.status) {
    values.push(String(filters.status).toLowerCase());
    where.push(`pay.payment_status = $${values.length}`);
  }

  if (filters && filters.email) {
    values.push(`%${String(filters.email).toLowerCase()}%`);
    where.push(`LOWER(p.email) LIKE $${values.length}`);
  }

  if (filters && filters.date) {
    values.push(String(filters.date));
    where.push(`pay.event_date = $${values.length}::date`);
  }

  const result = await pool.query(
    `
      SELECT
        pay.id,
        pay.order_code AS "orderCode",
        pay.payment_link_id AS "paymentLinkId",
        pay.checkout_url AS "checkoutUrl",
        pay.qr_code AS "qrCode",
        pay.amount,
        pay.paid_amount AS "paidAmount",
        pay.payment_status AS "paymentStatus",
        pay.payment_ref AS "paymentRef",
        pay.payment_code AS "paymentCode",
        pay.week_key AS "weekKey",
        pay.event_date AS "eventDate",
        pay.need_payment AS "needPayment",
        pay.group_mail_sent_at AS "groupMailSentAt",
        pay.created_at AS "createdAt",
        pay.updated_at AS "updatedAt",
        pay.paid_at AS "paidAt",
        p.email,
        p.ingame_name AS "ingameName"
      FROM payments pay
      JOIN players p ON p.id = pay.player_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY pay.created_at DESC, pay.id DESC
      LIMIT 1000
    `,
    values
  );

  return result.rows;
}

async function getPaymentByOrderCode(orderCode) {
  const result = await pool.query(
    `
      SELECT
        pay.*,
        p.email,
        p.ingame_name
      FROM payments pay
      JOIN players p ON p.id = pay.player_id
      WHERE pay.order_code = $1
      LIMIT 1
    `,
    [Number(orderCode)]
  );

  return result.rows[0] || null;
}

async function listReadyGroupMails(cooldownMinutes) {
  const result = await pool.query(
    `
      SELECT
        pay.id,
        pay.week_key AS "weekKey",
        pay.event_date AS "eventDate",
        pay.group_link AS "groupLink",
        pay.support_message AS "supportMessage",
        pay.paid_at AS "paidAt",
        p.email,
        p.ingame_name AS "ingameName"
      FROM payments pay
      JOIN players p ON p.id = pay.player_id
      WHERE pay.need_payment = TRUE
        AND pay.payment_status = 'paid'
        AND pay.group_mail_sent_at IS NULL
        AND pay.paid_at IS NOT NULL
        AND pay.paid_at <= NOW() - ($1 || ' minutes')::interval
      ORDER BY pay.paid_at ASC
      LIMIT 500
    `,
    [Number(cooldownMinutes)]
  );

  return result.rows;
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
