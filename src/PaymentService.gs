/**
 * Payment helpers (MongoDB-first).
 * Source of truth: backend API + MongoDB.
 */

function normalizePaymentStatusCode_(statusCode) {
  var normalized = normalizeSearchText_(statusCode).replace(/\s+/g, '_');
  if (!normalized) {
    return 'PENDING';
  }

  if (normalized.indexOf('link_sent') !== -1 || normalized.indexOf('da_gui_link') !== -1) {
    return 'LINK_SENT';
  }

  if (
    normalized.indexOf('paid') !== -1 ||
    normalized.indexOf('da_thanh_toan') !== -1 ||
    normalized.indexOf('thanh_cong') !== -1 ||
    normalized.indexOf('success') !== -1 ||
    normalized.indexOf('completed') !== -1
  ) {
    return 'PAID';
  }

  if (
    normalized.indexOf('failed') !== -1 ||
    normalized.indexOf('fail') !== -1 ||
    normalized.indexOf('timeout') !== -1 ||
    normalized.indexOf('expired') !== -1 ||
    normalized.indexOf('cancel') !== -1 ||
    normalized.indexOf('qua_han') !== -1 ||
    normalized.indexOf('het_han') !== -1
  ) {
    return 'FAILED';
  }

  if (
    normalized.indexOf('pending') !== -1 ||
    normalized.indexOf('cho_thanh_toan') !== -1 ||
    normalized.indexOf('processing') !== -1
  ) {
    return 'PENDING';
  }

  return String(statusCode || '').trim().toUpperCase() || 'PENDING';
}

function paymentStatusLabelFromCode_(statusCode) {
  var code = normalizePaymentStatusCode_(statusCode);
  if (code === 'FAILED') {
    return 'Thanh toán thất bại';
  }
  if (code === 'PAID' || code === 'LINK_SENT') {
    return 'Đã thanh toán';
  }
  return 'Chưa thanh toán';
}

function isPaymentRequired_(studentStatusRaw) {
  var text = normalizeSearchText_(studentStatusRaw);
  if (!text) {
    return false;
  }
  return text.indexOf('khong') !== -1;
}

function resolvePaymentRequired_(selectedItem, email, paymentMap) {
  if (selectedItem && Object.prototype.hasOwnProperty.call(selectedItem, 'paymentRequired')) {
    return toBoolean_(selectedItem.paymentRequired);
  }
  return !!(paymentMap && paymentMap[email]);
}

function getPaymentStatusMapForWeek_(weekKey) {
  var key = String(weekKey || '').trim();
  if (!key) {
    return {};
  }

  var response = apiGet_('/internal/payment-status-map', { weekKey: key });
  var map = response && response.map ? response.map : {};

  Object.keys(map).forEach(function(email) {
    var code = normalizePaymentStatusCode_(map[email].code || map[email]);
    map[email] = {
      code: code,
      label: paymentStatusLabelFromCode_(code)
    };
  });

  return map;
}

function processPaidPaymentRequests() {
  return processPaidPaymentMailsFromApi_();
}

function parseWebhookPayload_(e) {
  var bodyText = (e && e.postData && e.postData.contents) ? String(e.postData.contents || '') : '';
  if (!bodyText) {
    return {};
  }

  try {
    return JSON.parse(bodyText);
  } catch (err) {
    return {};
  }
}

function doPost(e) {
  try {
    var payload = parseWebhookPayload_(e);
    var result = apiPost_('/webhooks/payos', payload, null, { useInternalKey: false });
    return ContentService
      .createTextOutput(JSON.stringify(result || { ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(error && error.message ? error.message : error) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
