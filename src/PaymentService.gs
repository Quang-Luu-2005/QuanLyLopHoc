/**
 * Tiện ích thanh toán (ưu tiên MongoDB).
 * Nguồn dữ liệu chuẩn: backend API + MongoDB.
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
  var message = 'Mail thứ 2 đang chạy theo webhook doPost của Apps Script (không dùng polling từ Railway).';
  Logger.log(message);
  return {
    ok: true,
    mode: 'apps_script_webhook_only',
    message: message
  };
}

function parseWebhookPayload_(e) {
  var bodyText = (e && e.postData && e.postData.contents) ? String(e.postData.contents || '') : '';
  if (!bodyText) {
    return {};
  }

  try {
    return JSON.parse(bodyText);
  } catch (err) {
    var out = {};
    var pairs = bodyText.split('&');
    for (var i = 0; i < pairs.length; i++) {
      var parts = pairs[i].split('=');
      if (!parts.length) {
        continue;
      }
      var key = decodeURIComponent(String(parts[0] || '').replace(/\+/g, ' '));
      var val = decodeURIComponent(String(parts.slice(1).join('=') || '').replace(/\+/g, ' '));
      if (key) {
        out[key] = val;
      }
    }
    return out;
  }
}

function getPayosMailContextKey_(orderCode) {
  return 'PAYOS_MAIL_CTX_' + String(orderCode || '').trim();
}

function savePayosMailContext_(orderCode, context) {
  var key = getPayosMailContextKey_(orderCode);
  if (key === 'PAYOS_MAIL_CTX_') {
    return false;
  }

  var data = context && typeof context === 'object' ? context : {};
  var nowIso = new Date().toISOString();
  data.orderCode = String(orderCode || '').trim();
  data.updatedAt = nowIso;
  data.createdAt = data.createdAt || nowIso;

  PropertiesService.getScriptProperties().setProperty(key, JSON.stringify(data));
  return true;
}

function readPayosMailContext_(orderCode) {
  var key = getPayosMailContextKey_(orderCode);
  if (key === 'PAYOS_MAIL_CTX_') {
    return null;
  }

  var raw = PropertiesService.getScriptProperties().getProperty(key);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch (err) {
    return null;
  }
}

function markPayosMailContextSent_(orderCode, patch) {
  var current = readPayosMailContext_(orderCode) || {};
  var nowIso = new Date().toISOString();
  var extra = patch && typeof patch === 'object' ? patch : {};
  var merged = {};

  Object.keys(current).forEach(function(key) {
    merged[key] = current[key];
  });
  Object.keys(extra).forEach(function(key) {
    merged[key] = extra[key];
  });

  merged.orderCode = String(orderCode || '').trim();
  merged.mailSentAt = nowIso;
  merged.updatedAt = nowIso;

  PropertiesService.getScriptProperties().setProperty(getPayosMailContextKey_(orderCode), JSON.stringify(merged));
  return merged;
}

function sortObjectByKeyForPayos_(obj) {
  if (!obj || typeof obj !== 'object') {
    return {};
  }
  return Object.keys(obj).sort().reduce(function(acc, key) {
    acc[key] = obj[key];
    return acc;
  }, {});
}

function buildPayosWebhookSignatureData_(data) {
  var sorted = sortObjectByKeyForPayos_(data || {});
  var keys = Object.keys(sorted).filter(function(key) {
    return sorted[key] !== undefined;
  });

  var parts = [];
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    var value = sorted[key];
    if (Array.isArray(value)) {
      value = JSON.stringify(value.map(function(item) {
        if (item && typeof item === 'object' && !Array.isArray(item)) {
          return sortObjectByKeyForPayos_(item);
        }
        return item;
      }));
    }
    if (value === null || value === undefined || value === 'undefined' || value === 'null') {
      value = '';
    }
    parts.push(key + '=' + String(value));
  }

  return parts.join('&');
}

function verifyPayosWebhookSignatureOptional_(payload) {
  var checksumKey = String(
    (ENV && ENV.PAYOS_CHECKSUM_KEY) ||
    readScriptProperty_('PAYOS_CHECKSUM_KEY', '')
  ).trim();

  if (!checksumKey) {
    return { enabled: false, ok: true };
  }

  var signature = String(payload && payload.signature ? payload.signature : '').trim().toLowerCase();
  if (!signature) {
    return { enabled: true, ok: false, reason: 'SIGNATURE_MISSING' };
  }

  var data = payload && payload.data ? payload.data : {};
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch (err) {
      data = {};
    }
  }
  if (!data || typeof data !== 'object') {
    data = {};
  }

  var raw = buildPayosWebhookSignatureData_(data);
  var signatureBytes = Utilities.computeHmacSha256Signature(raw, checksumKey, Utilities.Charset.UTF_8);
  var expected = signatureBytes.map(function(byte) {
    var v = (byte < 0 ? byte + 256 : byte).toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('').toLowerCase();

  return {
    enabled: true,
    ok: expected === signature,
    reason: expected === signature ? 'OK' : 'SIGNATURE_MISMATCH'
  };
}

function extractPayosWebhookFields_(payload) {
  var body = payload || {};
  var data = body && body.data ? body.data : {};
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch (err) {
      data = {};
    }
  }
  if (!data || typeof data !== 'object') {
    data = {};
  }

  var orderCode = String(data.orderCode || body.orderCode || '').trim();
  var statusRaw = String(data.code || data.status || data.desc || body.code || body.status || body.desc || '').trim();
  var normalizedStatus = normalizePaymentStatusCode_(statusRaw);
  var isPaid = normalizedStatus === 'PAID' || String(data.code || body.code || '').trim() === '00' || body.success === true;

  return {
    orderCode: orderCode,
    statusRaw: statusRaw,
    normalizedStatus: normalizedStatus,
    isPaid: isPaid,
    reference: String(data.reference || data.transactionId || data.transaction_id || body.reference || '').trim(),
    payload: body
  };
}

function formatPayosEventDateText_(eventDateRaw) {
  var dateObj = parseDateInput_(eventDateRaw);
  if (!dateObj) {
    return 'sắp tới';
  }
  return formatDate_(dateObj, 'dd/MM/yyyy');
}

function sendGroupMailFromPayosContext_(ctx) {
  var email = normalizeEmail_(ctx && ctx.email);
  if (!email) {
    throw new Error('Thiếu email trong context webhook PayOS.');
  }

  var eventDateText = formatPayosEventDateText_(ctx && ctx.eventDate);
  var htmlBody = buildSelectionEmailHtml_(
    (ctx && (ctx.ingameName || ctx.name)) || email,
    eventDateText,
    String((ctx && ctx.groupLink) || '').trim(),
    String((ctx && ctx.supportMessage) || CONFIG.DEFAULT_MESSAGE || '').trim(),
    false
  );

  MailApp.sendEmail({
    to: email,
    subject: CONFIG.DEFAULT_SUBJECT.replace('{{eventDate}}', eventDateText),
    htmlBody: htmlBody,
    name: CONFIG.MAIL_SENDER_NAME || 'Lớp học Thành Mẫn'
  });

  return {
    email: email,
    eventDateText: eventDateText
  };
}

function markMailSentToBackendBestEffort_(paymentId, success, errorMessage) {
  var id = String(paymentId || '').trim();
  if (!id) {
    return { skipped: true, reason: 'payment_id_missing' };
  }
  if (!String((CONFIG.API && CONFIG.API.INTERNAL_API_KEY) || '').trim()) {
    return { skipped: true, reason: 'internal_api_key_missing' };
  }

  try {
    return apiPost_('/internal/mark-mail-sent', {
      paymentId: id,
      success: success !== false,
      error: success === false ? String(errorMessage || 'MAIL_SEND_FAILED') : ''
    });
  } catch (err) {
    Logger.log('markMailSentToBackendBestEffort_ thất bại: ' + String(err && err.message ? err.message : err));
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);

    var payload = parseWebhookPayload_(e);
    var signatureCheck = verifyPayosWebhookSignatureOptional_(payload);
    if (!signatureCheck.ok) {
      return ContentService
        .createTextOutput(JSON.stringify({
          ok: true,
          ignored: true,
          reason: signatureCheck.reason || 'INVALID_SIGNATURE'
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var fields = extractPayosWebhookFields_(payload);
    if (!fields.orderCode) {
      return ContentService
        .createTextOutput(JSON.stringify({ ok: true, ignored: true, reason: 'ORDER_CODE_MISSING' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var context = readPayosMailContext_(fields.orderCode);
    if (!context) {
      return ContentService
        .createTextOutput(JSON.stringify({ ok: true, ignored: true, reason: 'CONTEXT_NOT_FOUND', orderCode: fields.orderCode }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (context.mailSentAt) {
      return ContentService
        .createTextOutput(JSON.stringify({ ok: true, ignored: true, reason: 'MAIL_ALREADY_SENT', orderCode: fields.orderCode }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (!fields.isPaid) {
      return ContentService
        .createTextOutput(JSON.stringify({
          ok: true,
          ignored: true,
          reason: 'PAYMENT_NOT_PAID',
          orderCode: fields.orderCode,
          status: fields.normalizedStatus
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var mailResult = sendGroupMailFromPayosContext_(context);
    markPayosMailContextSent_(fields.orderCode, {
      status: 'LINK_SENT',
      paymentStatus: 'paid',
      paymentRef: fields.reference || context.paymentRef || '',
      webhookStatusRaw: fields.statusRaw,
      lastWebhookAt: new Date().toISOString()
    });
    markMailSentToBackendBestEffort_(context.paymentId, true, '');

    return ContentService
      .createTextOutput(JSON.stringify({
        ok: true,
        sent: true,
        orderCode: fields.orderCode,
        email: mailResult.email
      }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    try {
      var fallbackPayload = parseWebhookPayload_(e);
      var fallbackFields = extractPayosWebhookFields_(fallbackPayload);
      if (fallbackFields && fallbackFields.orderCode) {
        var fallbackContext = readPayosMailContext_(fallbackFields.orderCode);
        markMailSentToBackendBestEffort_(fallbackContext && fallbackContext.paymentId, false, String(error && error.message ? error.message : error));
      }
    } catch (innerErr) {
      Logger.log('Xử lý fallback doPost thất bại: ' + String(innerErr && innerErr.message ? innerErr.message : innerErr));
    }

    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(error && error.message ? error.message : error) }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    try {
      lock.releaseLock();
    } catch (err) {
      // ignore
    }
  }
}
