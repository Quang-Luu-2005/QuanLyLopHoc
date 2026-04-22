const crypto = require('crypto');

const PAYOS_API_BASE = String(process.env.PAYOS_API_BASE || 'https://api-merchant.payos.vn').trim().replace(/\/+$/, '');
const PAYOS_CLIENT_ID = String(process.env.PAYOS_CLIENT_ID || '').trim();
const PAYOS_API_KEY = String(process.env.PAYOS_API_KEY || '').trim();
const PAYOS_CHECKSUM_KEY = String(process.env.PAYOS_CHECKSUM_KEY || '').trim();

function assertPayosConfig() {
  if (!PAYOS_CLIENT_ID || !PAYOS_API_KEY || !PAYOS_CHECKSUM_KEY) {
    const err = new Error('Missing PayOS configuration (PAYOS_CLIENT_ID / PAYOS_API_KEY / PAYOS_CHECKSUM_KEY)');
    err.statusCode = 500;
    throw err;
  }
}

function hmacSha256Hex(input, key) {
  return crypto.createHmac('sha256', key).update(input).digest('hex');
}

function buildCreatePaymentSignature({ amount, cancelUrl, description, orderCode, returnUrl }) {
  const raw = `amount=${amount}&cancelUrl=${cancelUrl}&description=${description}&orderCode=${orderCode}&returnUrl=${returnUrl}`;
  return hmacSha256Hex(raw, PAYOS_CHECKSUM_KEY);
}

function normalizeValue(value) {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

function sortObject(obj) {
  if (Array.isArray(obj)) {
    return obj.map((item) => {
      if (item && typeof item === 'object') {
        return sortObject(item);
      }
      return item;
    });
  }

  if (obj && typeof obj === 'object') {
    const out = {};
    Object.keys(obj).sort().forEach((key) => {
      out[key] = sortObject(obj[key]);
    });
    return out;
  }

  return obj;
}

function buildWebhookSignatureData(data) {
  const sorted = sortObject(data || {});
  return Object.keys(sorted)
    .map((key) => `${key}=${encodeURIComponent(normalizeValue(sorted[key]))}`)
    .join('&');
}

function verifyWebhookSignature(payload) {
  const received = String(payload && payload.signature ? payload.signature : '').toLowerCase();
  if (!received) {
    return false;
  }

  const rawData = buildWebhookSignatureData(payload && payload.data ? payload.data : {});
  const expected = hmacSha256Hex(rawData, PAYOS_CHECKSUM_KEY).toLowerCase();
  return expected === received;
}

function mapPayosStatus(rawStatus) {
  const text = String(rawStatus || '').trim().toLowerCase();
  if (!text) {
    return 'pending';
  }

  if (text === '00' || text === '0' || text.includes('paid') || text.includes('success') || text.includes('completed')) {
    return 'paid';
  }

  if (text.includes('cancel')) {
    return 'cancelled';
  }

  if (text.includes('expire')) {
    return 'expired';
  }

  if (text.includes('fail') || text.includes('error')) {
    return 'failed';
  }

  if (text.includes('pending') || text.includes('processing')) {
    return 'pending';
  }

  return 'pending';
}

async function createPaymentLink({ orderCode, amount, description, buyerName, buyerEmail, returnUrl, cancelUrl }) {
  assertPayosConfig();

  const payload = {
    orderCode: Number(orderCode),
    amount: Number(amount),
    description: String(description || '').trim().slice(0, 25),
    cancelUrl: String(cancelUrl || ''),
    returnUrl: String(returnUrl || '')
  };

  payload.signature = buildCreatePaymentSignature(payload);

  if (buyerName) {
    payload.buyerName = String(buyerName);
  }
  if (buyerEmail) {
    payload.buyerEmail = String(buyerEmail);
  }

  payload.items = [
    {
      name: 'Phí tham gia thi đấu',
      quantity: 1,
      price: Number(amount)
    }
  ];

  const response = await fetch(`${PAYOS_API_BASE}/v2/payment-requests`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-client-id': PAYOS_CLIENT_ID,
      'x-api-key': PAYOS_API_KEY
    },
    body: JSON.stringify(payload)
  });

  const json = await response.json().catch(() => ({}));

  if (!response.ok || String(json.code || '') !== '00' || !json.data) {
    const err = new Error(`PayOS create payment failed: ${json.desc || response.statusText || response.status}`);
    err.statusCode = 502;
    err.payload = json;
    throw err;
  }

  return {
    orderCode: json.data.orderCode,
    paymentLinkId: json.data.paymentLinkId || '',
    checkoutUrl: json.data.checkoutUrl || '',
    qrCode: json.data.qrCode || ''
  };
}

module.exports = {
  PAYOS_API_BASE,
  PAYOS_CLIENT_ID,
  PAYOS_API_KEY,
  PAYOS_CHECKSUM_KEY,
  assertPayosConfig,
  buildCreatePaymentSignature,
  verifyWebhookSignature,
  mapPayosStatus,
  createPaymentLink
};
