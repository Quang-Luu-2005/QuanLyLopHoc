/**
 * Auto-split module from legacy Code.gs
 */

function getPaymentRequestColumnIndex_() {
  return {
    requestId: 0,
    createdAt: 1,
    updatedAt: 2,
    weekKey: 3,
    eventDate: 4,
    eventDateKey: 5,
    email: 6,
    name: 7,
    ingame: 8,
    needPayment: 9,
    paymentStatus: 10,
    paymentCode: 11,
    amountText: 12,
    groupLink: 13,
    supportMessage: 14,
    payosOrderCode: 15,
    payosPaymentLinkId: 16,
    payosCheckoutUrl: 17,
    payosQrCode: 18,
    paidAt: 19,
    paidAmount: 20,
    paidContent: 21,
    paymentRef: 22,
    groupMailSentAt: 23,
    lastMailAt: 24,
    lastError: 25
  };
}


function rowValuesToPaymentRequest_(values, rowIndex) {
  var idx = getPaymentRequestColumnIndex_();
  return {
    rowIndex: rowIndex,
    values: values.slice(),
    requestId: String(values[idx.requestId] || ''),
    createdAt: toDate_(values[idx.createdAt]),
    updatedAt: toDate_(values[idx.updatedAt]),
    weekKey: String(values[idx.weekKey] || ''),
    eventDate: toDate_(values[idx.eventDate]),
    eventDateKey: String(values[idx.eventDateKey] || ''),
    email: normalizeEmail_(values[idx.email]),
    name: String(values[idx.name] || ''),
    ingame: String(values[idx.ingame] || ''),
    needPayment: toBoolean_(values[idx.needPayment]),
    paymentStatus: String(values[idx.paymentStatus] || ''),
    paymentCode: String(values[idx.paymentCode] || ''),
    amountText: String(values[idx.amountText] || ''),
    groupLink: String(values[idx.groupLink] || ''),
    supportMessage: String(values[idx.supportMessage] || ''),
    payosOrderCode: String(values[idx.payosOrderCode] || ''),
    payosPaymentLinkId: String(values[idx.payosPaymentLinkId] || ''),
    payosCheckoutUrl: String(values[idx.payosCheckoutUrl] || ''),
    payosQrCode: String(values[idx.payosQrCode] || ''),
    paidAt: toDate_(values[idx.paidAt]),
    paidAmount: Number(values[idx.paidAmount]) || 0,
    paidContent: String(values[idx.paidContent] || ''),
    paymentRef: String(values[idx.paymentRef] || ''),
    groupMailSentAt: toDate_(values[idx.groupMailSentAt]),
    lastMailAt: toDate_(values[idx.lastMailAt]),
    lastError: String(values[idx.lastError] || '')
  };
}


function readPaymentRequestRows_() {
  var sheet = getOrCreateSheet_(CONFIG.SHEETS.PAYMENT_REQUESTS, CONFIG.PAYMENT_REQUEST_HEADERS);
  if (sheet.getLastRow() < 2) {
    return [];
  }

  var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, CONFIG.PAYMENT_REQUEST_HEADERS.length).getValues();
  var rows = [];

  for (var i = 0; i < values.length; i++) {
    var rowObj = rowValuesToPaymentRequest_(values[i], i + 2);
    if (!rowObj.email) {
      continue;
    }
    rows.push(rowObj);
  }

  return rows;
}


function getPaymentStatusLogSheet_() {
  var statusConfig = CONFIG.PAYMENT_STATUS || {};
  var spreadsheetId = String(statusConfig.SPREADSHEET_ID || '').trim();
  var sheetName = String(statusConfig.SHEET_NAME || 'Payment_Status_Log').trim() || 'Payment_Status_Log';
  var headers = CONFIG.PAYMENT_STATUS_LOG_HEADERS || [];

  var ss = spreadsheetId ? SpreadsheetApp.openById(spreadsheetId) : getTargetSpreadsheet_();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }

  if (headers.length) {
    var current = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
    var needHeaderUpdate = false;
    for (var i = 0; i < headers.length; i++) {
      if (current[i] !== headers[i]) {
        needHeaderUpdate = true;
        break;
      }
    }
    if (needHeaderUpdate) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    }
  }

  return sheet;
}


function appendPaymentStatusLog_(requestRow, source, note) {
  if (!requestRow || !requestRow.email) {
    return;
  }

  var sheet = getPaymentStatusLogSheet_();
  var paidAmount = Number(requestRow.paidAmount || 0);
  var row = [
    new Date(),
    String(requestRow.weekKey || ''),
    String(requestRow.eventDateKey || ''),
    String(requestRow.email || ''),
    String(requestRow.name || ''),
    String(requestRow.ingame || ''),
    String(requestRow.paymentCode || ''),
    normalizePaymentStatusCode_(requestRow.paymentStatus),
    paidAmount > 0 ? paidAmount : '',
    String(requestRow.paymentRef || ''),
    String(requestRow.payosOrderCode || ''),
    String(requestRow.payosPaymentLinkId || ''),
    String(requestRow.payosCheckoutUrl || ''),
    String(source || ''),
    String(note || '')
  ];

  sheet.getRange(sheet.getLastRow() + 1, 1, 1, CONFIG.PAYMENT_STATUS_LOG_HEADERS.length).setValues([row]);
}


function appendPaymentStatusLogSafe_(requestRow, source, note) {
  try {
    appendPaymentStatusLog_(requestRow, source, note);
  } catch (error) {
    Logger.log('Payment status log failed: ' + String(error && error.message ? error.message : error));
  }
}


function getPaymentStatusMapForWeek_(weekKey) {
  var targetWeekKey = String(weekKey || '').trim();
  if (targetWeekKey) {
    try {
      refreshWeekPaymentStatusFromPayos_(targetWeekKey);
    } catch (error) {
      Logger.log('refreshWeekPaymentStatusFromPayos failed: ' + String(error && error.message ? error.message : error));
    }
  }

  var rows = readPaymentRequestRows_();
  var effective = buildEffectivePaymentRequestMapByWeekEmail_(rows, targetWeekKey);

  var map = {};
  Object.keys(effective).forEach(function(key) {
    var row = effective[key];
    if (!row || !row.needPayment || !row.email) {
      return;
    }
    var code = normalizePaymentStatusCode_(row.paymentStatus);
    map[row.email] = {
      code: code,
      label: paymentStatusLabelFromCode_(code)
    };
  });
  return map;
}


function refreshWeekPaymentStatusFromPayos_(weekKey) {
  var targetWeekKey = String(weekKey || '').trim();
  if (!targetWeekKey || !hasPayosConfig_()) {
    return {
      checked: 0,
      paid: 0,
      failed: 0,
      ignoredOld: 0,
      errors: 0,
      expired: 0
    };
  }

  var rows = readPaymentRequestRows_();
  var weekRows = [];
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].weekKey || '') === targetWeekKey) {
      weekRows.push(rows[i]);
    }
  }

  if (!weekRows.length) {
    return {
      checked: 0,
      paid: 0,
      failed: 0,
      ignoredOld: 0,
      errors: 0,
      expired: 0
    };
  }

  var syncResult = syncLatestPendingPaymentsFromPayos_(weekRows);
  var expired = expirePendingPaymentRequests_(weekRows);
  return {
    checked: Number(syncResult.checked || 0),
    paid: Number(syncResult.paid || 0),
    failed: Number(syncResult.failed || 0),
    ignoredOld: Number(syncResult.ignoredOld || 0),
    errors: Number(syncResult.errors || 0),
    expired: Number(expired || 0)
  };
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


function generatePaymentCode_(requestId) {
  var prefix = String((CONFIG.PAYMENT && CONFIG.PAYMENT.CODE_PREFIX) || 'GE')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase();
  if (!prefix) {
    prefix = 'GE';
  }
  var maxLen = 9;
  var tokenLen = Math.max(4, maxLen - prefix.length);
  var token = String(requestId || '')
    .replace(/-/g, '')
    .toUpperCase()
    .slice(0, tokenLen);
  return (prefix + token).slice(0, maxLen);
}


function findLatestPaymentRequest_(weekKey, eventDateKey, email) {
  var rows = readPaymentRequestRows_();
  var latest = null;

  for (var i = 0; i < rows.length; i++) {
    if (rows[i].weekKey !== String(weekKey || '')) {
      continue;
    }
    if (rows[i].email !== normalizeEmail_(email)) {
      continue;
    }

    if (!latest) {
      latest = rows[i];
      continue;
    }

    var currentTime = toDate_(rows[i].updatedAt || rows[i].createdAt);
    var latestTime = toDate_(latest.updatedAt || latest.createdAt);
    if (currentTime && (!latestTime || currentTime.getTime() > latestTime.getTime())) {
      latest = rows[i];
    }
  }

  return latest;
}


function getPaymentRequestTimeMs_(row) {
  var time = toDate_(row && (row.updatedAt || row.createdAt));
  return time ? time.getTime() : 0;
}


function getPaymentStatusPriority_(statusCode) {
  var code = normalizePaymentStatusCode_(statusCode);
  if (code === 'LINK_SENT') {
    return 4;
  }
  if (code === 'PAID') {
    return 3;
  }
  if (code === 'PENDING') {
    return 2;
  }
  if (code === 'FAILED') {
    return 1;
  }
  return 0;
}


function shouldUseCandidatePaymentRow_(candidate, current) {
  if (!candidate) {
    return false;
  }
  if (!current) {
    return true;
  }

  var candidatePriority = getPaymentStatusPriority_(candidate.paymentStatus);
  var currentPriority = getPaymentStatusPriority_(current.paymentStatus);
  if (candidatePriority !== currentPriority) {
    return candidatePriority > currentPriority;
  }

  return getPaymentRequestTimeMs_(candidate) >= getPaymentRequestTimeMs_(current);
}


function buildEffectivePaymentRequestMapByWeekEmail_(rows, weekKey) {
  var list = Array.isArray(rows) ? rows : readPaymentRequestRows_();
  var targetWeekKey = String(weekKey || '').trim();
  var map = {};

  for (var i = 0; i < list.length; i++) {
    if (targetWeekKey && String(list[i].weekKey || '') !== targetWeekKey) {
      continue;
    }

    var key = getPaymentRequestWeekEmailKey_(list[i]);
    if (!key) {
      continue;
    }

    if (shouldUseCandidatePaymentRow_(list[i], map[key])) {
      map[key] = list[i];
    }
  }

  return map;
}


function getPaymentRequestWeekEmailKey_(row) {
  if (!row) {
    return '';
  }
  var weekKey = String(row.weekKey || '').trim();
  var email = normalizeEmail_(row.email);
  if (!weekKey || !email) {
    return '';
  }
  return weekKey + '|' + email;
}


function buildLatestPaymentRequestMapByWeekEmail_(rows) {
  var list = Array.isArray(rows) ? rows : readPaymentRequestRows_();
  var map = {};

  for (var i = 0; i < list.length; i++) {
    var key = getPaymentRequestWeekEmailKey_(list[i]);
    if (!key) {
      continue;
    }

    var current = map[key];
    if (!current || getPaymentRequestTimeMs_(list[i]) >= getPaymentRequestTimeMs_(current)) {
      map[key] = list[i];
    }
  }

  return map;
}


function isLatestPaymentRequestForWeekEmail_(requestRow, latestMap) {
  if (!requestRow) {
    return false;
  }
  var key = getPaymentRequestWeekEmailKey_(requestRow);
  if (!key) {
    return false;
  }
  var map = latestMap || buildLatestPaymentRequestMapByWeekEmail_();
  var latest = map[key];
  return !!(latest && Number(latest.rowIndex) === Number(requestRow.rowIndex));
}


function upsertPaymentRequest_(params) {
  params = params || {};
  var weekKey = String(params.weekKey || '').trim();
  var eventDate = parseDateInput_(params.eventDate);
  var eventDateKey = String(params.eventDateKey || '');
  var email = normalizeEmail_(params.email);
  var name = String(params.name || '').trim();
  var ingame = String(params.ingame || '').trim();
  var groupLink = String(params.groupLink || '').trim();
  var supportMessage = String(params.supportMessage || '').trim();

  if (!weekKey || !eventDate || !eventDateKey || !email) {
    throw new Error('Thiếu dữ liệu để tạo yêu cầu thanh toán.');
  }

  var sheet = getOrCreateSheet_(CONFIG.SHEETS.PAYMENT_REQUESTS, CONFIG.PAYMENT_REQUEST_HEADERS);
  var idx = getPaymentRequestColumnIndex_();
  var existing = findLatestPaymentRequest_(weekKey, eventDateKey, email);
  var now = new Date();

  if (existing) {
    var existingStatus = normalizePaymentStatusCode_(existing.paymentStatus);
    var updated = updatePaymentRequestRow_(existing.rowIndex, function(values, col) {
      values[col.eventDate] = eventDate;
      values[col.eventDateKey] = eventDateKey;
      values[col.name] = name;
      values[col.ingame] = ingame;
      values[col.needPayment] = true;
      values[col.amountText] = String((CONFIG.PAYMENT && CONFIG.PAYMENT.FEE_TEXT) || '50.000đ');
      values[col.groupLink] = groupLink;
      values[col.supportMessage] = supportMessage;
      if (!values[col.paymentCode]) {
        values[col.paymentCode] = generatePaymentCode_(values[col.requestId] || Utilities.getUuid());
      }
      if (existingStatus !== 'PAID' && existingStatus !== 'LINK_SENT') {
        values[col.paymentStatus] = 'PENDING';
      }
    });
    syncPaymentStatusToResponsesSafe_(updated);
    return updated;
  }

  var requestId = Utilities.getUuid();
  var paymentCode = generatePaymentCode_(requestId);
  var rowValues = [];
  rowValues[idx.requestId] = requestId;
  rowValues[idx.createdAt] = now;
  rowValues[idx.updatedAt] = now;
  rowValues[idx.weekKey] = weekKey;
  rowValues[idx.eventDate] = eventDate;
  rowValues[idx.eventDateKey] = eventDateKey;
  rowValues[idx.email] = email;
  rowValues[idx.name] = name;
  rowValues[idx.ingame] = ingame;
  rowValues[idx.needPayment] = true;
  rowValues[idx.paymentStatus] = 'PENDING';
  rowValues[idx.paymentCode] = paymentCode;
  rowValues[idx.amountText] = String((CONFIG.PAYMENT && CONFIG.PAYMENT.FEE_TEXT) || '50.000đ');
  rowValues[idx.groupLink] = groupLink;
  rowValues[idx.supportMessage] = supportMessage;
  rowValues[idx.payosOrderCode] = '';
  rowValues[idx.payosPaymentLinkId] = '';
  rowValues[idx.payosCheckoutUrl] = '';
  rowValues[idx.payosQrCode] = '';
  rowValues[idx.paidAt] = '';
  rowValues[idx.paidAmount] = '';
  rowValues[idx.paidContent] = '';
  rowValues[idx.paymentRef] = '';
  rowValues[idx.groupMailSentAt] = '';
  rowValues[idx.lastMailAt] = '';
  rowValues[idx.lastError] = '';

  sheet.getRange(sheet.getLastRow() + 1, 1, 1, CONFIG.PAYMENT_REQUEST_HEADERS.length).setValues([rowValues]);
  var created = rowValuesToPaymentRequest_(rowValues, sheet.getLastRow());
  appendPaymentStatusLogSafe_(created, 'CREATE_REQUEST', 'Create payment request');
  syncPaymentStatusToResponsesSafe_(created);
  return created;
}


function updatePaymentRequestRow_(rowIndex, updater, logOptions) {
  var sheet = getOrCreateSheet_(CONFIG.SHEETS.PAYMENT_REQUESTS, CONFIG.PAYMENT_REQUEST_HEADERS);
  var values = sheet.getRange(rowIndex, 1, 1, CONFIG.PAYMENT_REQUEST_HEADERS.length).getValues()[0];
  var idx = getPaymentRequestColumnIndex_();
  var before = rowValuesToPaymentRequest_(values, rowIndex);

  updater(values, idx);
  values[idx.updatedAt] = new Date();

  sheet.getRange(rowIndex, 1, 1, CONFIG.PAYMENT_REQUEST_HEADERS.length).setValues([values]);
  var updated = rowValuesToPaymentRequest_(values, rowIndex);
  var beforeStatus = normalizePaymentStatusCode_(before.paymentStatus);
  var afterStatus = normalizePaymentStatusCode_(updated.paymentStatus);
  var changed = beforeStatus !== afterStatus;
  var forceLog = !!(logOptions && logOptions.forceLog);

  if (changed || forceLog) {
    var source = (logOptions && logOptions.source) ? String(logOptions.source) : 'STATUS_UPDATE';
    var note = (logOptions && logOptions.note) ? String(logOptions.note) : '';
    appendPaymentStatusLogSafe_(updated, source, note);
  }

  if (changed || forceLog) {
    syncPaymentStatusToResponsesSafe_(updated);
  }

  return updated;
}


function findLatestPaymentRequestByCode_(paymentCode) {
  var code = String(paymentCode || '').trim().toUpperCase();
  if (!code) {
    return null;
  }

  var rows = readPaymentRequestRows_();
  var candidates = [];
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].paymentCode || '').toUpperCase() === code) {
      candidates.push(rows[i]);
    }
  }

  if (!candidates.length) {
    return null;
  }

  candidates.sort(function(a, b) {
    var aPending = normalizePaymentStatusCode_(a.paymentStatus) === 'PENDING' ? 1 : 0;
    var bPending = normalizePaymentStatusCode_(b.paymentStatus) === 'PENDING' ? 1 : 0;
    if (bPending !== aPending) {
      return bPending - aPending;
    }
    var at = toDate_(a.updatedAt || a.createdAt);
    var bt = toDate_(b.updatedAt || b.createdAt);
    var aEpoch = at ? at.getTime() : 0;
    var bEpoch = bt ? bt.getTime() : 0;
    return bEpoch - aEpoch;
  });

  return candidates[0];
}


function buildPaymentEmailSubject_(eventDateText) {
  return 'Yêu cầu thanh toán phí thi đấu ngày ' + eventDateText;
}


function getPaymentAmount_() {
  var amount = Number((CONFIG.PAYMENT && CONFIG.PAYMENT.AMOUNT) || 0);
  if (!amount || amount < 1000) {
    amount = 50000;
  }
  return Math.round(amount);
}


function getPaymentTimeoutHours_() {
  var hours = Number((CONFIG.PAYMENT && CONFIG.PAYMENT.TIMEOUT_HOURS) || 12);
  if (!hours || hours < 1) {
    hours = 12;
  }
  return hours;
}


function getGroupMailCooldownMinutes_() {
  var minutes = Number((CONFIG.PAYMENT && CONFIG.PAYMENT.GROUP_MAIL_COOLDOWN_MINUTES) || 2);
  if (isNaN(minutes) || minutes < 0) {
    minutes = 2;
  }
  return minutes;
}


function isGroupMailCooldownElapsed_(requestRow, now) {
  var cooldownMinutes = getGroupMailCooldownMinutes_();
  if (cooldownMinutes <= 0) {
    return true;
  }

  var paidAt = toDate_(requestRow ? requestRow.paidAt : '');
  if (!paidAt) {
    return false;
  }

  var currentTime = now || new Date();
  var cooldownMs = cooldownMinutes * 60 * 1000;
  return (currentTime.getTime() - paidAt.getTime()) >= cooldownMs;
}


function isPaymentRequestExpired_(requestRow, now) {
  if (!requestRow || !requestRow.needPayment) {
    return false;
  }
  if (normalizePaymentStatusCode_(requestRow.paymentStatus) !== 'PENDING') {
    return false;
  }

  var sentAt = toDate_(requestRow.lastMailAt);
  if (!sentAt) {
    return false;
  }

  var timeoutMs = getPaymentTimeoutHours_() * 60 * 60 * 1000;
  return (now.getTime() - sentAt.getTime()) >= timeoutMs;
}


function expirePendingPaymentRequests_(rows) {
  var list = Array.isArray(rows) ? rows : readPaymentRequestRows_();
  var now = new Date();
  var timeoutHours = getPaymentTimeoutHours_();
  var expired = 0;

  for (var i = 0; i < list.length; i++) {
    if (!isPaymentRequestExpired_(list[i], now)) {
      continue;
    }

    updatePaymentRequestRow_(list[i].rowIndex, function(values, idx) {
      values[idx.paymentStatus] = 'FAILED';
      values[idx.lastError] = 'Thanh toán quá hạn ' + timeoutHours + ' giờ.';
    }, {
      source: 'PAYMENT_TIMEOUT',
      note: 'Auto-fail after ' + timeoutHours + 'h pending'
    });
    expired++;
  }

  return expired;
}


function validatePayosConfig_() {
  var payment = CONFIG.PAYMENT || {};
  if (!String(payment.PAYOS_CLIENT_ID || '').trim()) {
    throw new Error('Thiếu CONFIG.PAYMENT.PAYOS_CLIENT_ID');
  }
  if (!String(payment.PAYOS_API_KEY || '').trim()) {
    throw new Error('Thiếu CONFIG.PAYMENT.PAYOS_API_KEY');
  }
  if (!String(payment.PAYOS_CHECKSUM_KEY || '').trim()) {
    throw new Error('Thiếu CONFIG.PAYMENT.PAYOS_CHECKSUM_KEY');
  }
}


function hasPayosConfig_() {
  var payment = CONFIG.PAYMENT || {};
  return !!(
    String(payment.PAYOS_CLIENT_ID || '').trim() &&
    String(payment.PAYOS_API_KEY || '').trim() &&
    String(payment.PAYOS_CHECKSUM_KEY || '').trim()
  );
}


function generatePayosOrderCode_() {
  var base = Number(new Date().getTime());
  var suffix = Math.floor(Math.random() * 900 + 100);
  return Number(String(base) + String(suffix));
}


function appendQueryParams_(url, params) {
  var base = String(url || '').trim();
  if (!base) {
    return '';
  }

  var keys = Object.keys(params || {});
  var pairs = [];
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    var value = String(params[key] || '').trim();
    if (!value) {
      continue;
    }
    pairs.push(encodeURIComponent(key) + '=' + encodeURIComponent(value));
  }

  if (!pairs.length) {
    return base;
  }

  var separator = base.indexOf('?') === -1 ? '?' : '&';
  return base + separator + pairs.join('&');
}


function resolvePayosRedirectUrl_(kind, requestRow) {
  var payment = CONFIG.PAYMENT || {};
  var explicitUrl = kind === 'cancel'
    ? String(payment.PAYOS_CANCEL_URL || '').trim()
    : String(payment.PAYOS_RETURN_URL || '').trim();
  if (explicitUrl) {
    return explicitUrl;
  }

  var webAppUrl = '';
  try {
    webAppUrl = String(ScriptApp.getService().getUrl() || '').trim();
  } catch (err) {
    webAppUrl = '';
  }

  if (webAppUrl) {
    return appendQueryParams_(webAppUrl, {
      payos: String(kind || ''),
      code: requestRow ? String(requestRow.paymentCode || '') : ''
    });
  }

  var spreadsheetUrl = String((CONFIG.TARGET && CONFIG.TARGET.SPREADSHEET_URL) || '').trim();
  if (spreadsheetUrl) {
    return spreadsheetUrl;
  }

  return 'https://payos.vn';
}


function buildPayosSignature_(amount, cancelUrl, description, orderCode, returnUrl) {
  var dataStr =
    'amount=' + amount +
    '&cancelUrl=' + cancelUrl +
    '&description=' + description +
    '&orderCode=' + orderCode +
    '&returnUrl=' + returnUrl;
  var checksumKey = String((CONFIG.PAYMENT && CONFIG.PAYMENT.PAYOS_CHECKSUM_KEY) || '');
  var signatureBytes = Utilities.computeHmacSha256Signature(dataStr, checksumKey);
  return signatureBytes
    .map(function(b) {
      var v = (b < 0 ? b + 256 : b).toString(16);
      return v.length === 1 ? '0' + v : v;
    })
    .join('');
}


function createPayosPaymentLink_(requestRow) {
  validatePayosConfig_();

  var payment = CONFIG.PAYMENT || {};
  var amount = getPaymentAmount_();
  var orderCode = generatePayosOrderCode_();
  var description = String(requestRow.paymentCode || '');
  var cancelUrl = resolvePayosRedirectUrl_('cancel', requestRow);
  var returnUrl = resolvePayosRedirectUrl_('return', requestRow);
  var signature = buildPayosSignature_(amount, cancelUrl, description, orderCode, returnUrl);
  var apiBase = String(payment.PAYOS_API_BASE || 'https://api-merchant.payos.vn').trim().replace(/\/+$/, '');
  var endpoint = apiBase + '/v2/payment-requests';

  var body = {
    orderCode: orderCode,
    amount: amount,
    description: description,
    cancelUrl: cancelUrl,
    returnUrl: returnUrl,
    signature: signature
  };

  if (requestRow.name) {
    body.buyerName = String(requestRow.name || '');
  }
  if (requestRow.email) {
    body.buyerEmail = String(requestRow.email || '');
  }
  body.items = [{
    name: 'Phí tham gia thi đấu',
    quantity: 1,
    price: amount
  }];

  var response = UrlFetchApp.fetch(endpoint, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'x-client-id': String(payment.PAYOS_CLIENT_ID || '').trim(),
      'x-api-key': String(payment.PAYOS_API_KEY || '').trim()
    },
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  });

  var status = Number(response.getResponseCode() || 0);
  var text = response.getContentText();
  var json = {};
  try {
    json = JSON.parse(text);
  } catch (err) {
    throw new Error('PayOS trả về dữ liệu không hợp lệ: HTTP ' + status + ' - ' + text);
  }

  if (status < 200 || status >= 300 || String(json.code || '') !== '00' || !json.data) {
    throw new Error('Tạo link PayOS thất bại: ' + (json.desc || ('HTTP ' + status)));
  }

  return {
    orderCode: json.data.orderCode,
    paymentLinkId: json.data.paymentLinkId || '',
    checkoutUrl: json.data.checkoutUrl || '',
    qrCode: json.data.qrCode || ''
  };
}


function ensurePayosPaymentLinkForRequest_(requestRow) {
  if (!requestRow) {
    throw new Error('Không tìm thấy yêu cầu thanh toán để tạo link PayOS.');
  }

  if (requestRow.payosCheckoutUrl) {
    return {
      orderCode: requestRow.payosOrderCode,
      paymentLinkId: requestRow.payosPaymentLinkId,
      checkoutUrl: requestRow.payosCheckoutUrl,
      qrCode: requestRow.payosQrCode
    };
  }

  var payos = createPayosPaymentLink_(requestRow);
  var updated = updatePaymentRequestRow_(requestRow.rowIndex, function(values, idx) {
    values[idx.payosOrderCode] = String(payos.orderCode || '');
    values[idx.payosPaymentLinkId] = String(payos.paymentLinkId || '');
    values[idx.payosCheckoutUrl] = String(payos.checkoutUrl || '');
    values[idx.payosQrCode] = String(payos.qrCode || '');
    values[idx.amountText] = String((CONFIG.PAYMENT && CONFIG.PAYMENT.FEE_TEXT) || '50.000đ');
    values[idx.lastError] = '';
  });

  return {
    orderCode: updated.payosOrderCode,
    paymentLinkId: updated.payosPaymentLinkId,
    checkoutUrl: updated.payosCheckoutUrl,
    qrCode: updated.payosQrCode
  };
}


function getPayosPaymentStatusByOrderCode_(orderCode) {
  var code = String(orderCode || '').trim();
  if (!code) {
    return { ok: false, statusCode: 'PENDING', statusRaw: '', note: 'Missing orderCode' };
  }

  if (!hasPayosConfig_()) {
    return { ok: false, statusCode: 'PENDING', statusRaw: '', note: 'Missing PayOS config' };
  }

  var payment = CONFIG.PAYMENT || {};
  var apiBase = String(payment.PAYOS_API_BASE || 'https://api-merchant.payos.vn').trim().replace(/\/+$/, '');
  var endpoint = apiBase + '/v2/payment-requests/' + encodeURIComponent(code);

  try {
    var response = UrlFetchApp.fetch(endpoint, {
      method: 'get',
      headers: {
        'x-client-id': String(payment.PAYOS_CLIENT_ID || '').trim(),
        'x-api-key': String(payment.PAYOS_API_KEY || '').trim()
      },
      muteHttpExceptions: true,
      followRedirects: true
    });

    var httpStatus = Number(response.getResponseCode() || 0);
    var bodyText = response.getContentText();
    var json = {};
    try {
      json = JSON.parse(bodyText);
    } catch (err) {
      return {
        ok: false,
        statusCode: 'PENDING',
        statusRaw: '',
        note: 'PayOS non-JSON response: HTTP ' + httpStatus
      };
    }

    if (httpStatus < 200 || httpStatus >= 300 || String(json.code || '') !== '00' || !json.data) {
      return {
        ok: false,
        statusCode: 'PENDING',
        statusRaw: '',
        note: String(json.desc || ('HTTP ' + httpStatus))
      };
    }

    var data = json.data || {};
    var statusRaw = pickFirstNonEmpty_([
      data.status,
      data.paymentStatus,
      data.state,
      data.code
    ]);
    var statusCode = normalizePaymentStatusCode_(statusRaw);
    var paidAmount = parseNumberSafe_(pickFirstNonEmpty_([
      data.amountPaid,
      data.paidAmount,
      data.amount
    ]));
    var paymentRef = pickFirstNonEmpty_([
      data.reference,
      data.transactionId,
      data.transaction_id
    ]);

    return {
      ok: true,
      statusCode: statusCode,
      statusRaw: statusRaw,
      paidAmount: paidAmount,
      paymentRef: paymentRef,
      note: ''
    };
  } catch (error) {
    return {
      ok: false,
      statusCode: 'PENDING',
      statusRaw: '',
      note: String(error && error.message ? error.message : error)
    };
  }
}


function getPayosPaymentStatusForRequestRow_(requestRow) {
  var firstTry = getPayosPaymentStatusByOrderCode_(requestRow ? requestRow.payosOrderCode : '');
  if (firstTry.ok) {
    return firstTry;
  }

  var fallbackKey = requestRow ? String(requestRow.payosPaymentLinkId || '').trim() : '';
  if (!fallbackKey) {
    return firstTry;
  }

  return getPayosPaymentStatusByOrderCode_(fallbackKey);
}


function syncLatestPendingPaymentsFromPayos_(rows) {
  var list = Array.isArray(rows) ? rows : readPaymentRequestRows_();
  if (!list.length || !hasPayosConfig_()) {
    return { checked: 0, paid: 0, failed: 0, ignoredOld: 0, errors: 0 };
  }

  var latestMap = buildLatestPaymentRequestMapByWeekEmail_(list);
  var checked = 0;
  var paid = 0;
  var failed = 0;
  var ignoredOld = 0;
  var errors = 0;

  for (var i = 0; i < list.length; i++) {
    var row = list[i];
    if (!row.needPayment) {
      continue;
    }
    if (!isLatestPaymentRequestForWeekEmail_(row, latestMap)) {
      if (normalizePaymentStatusCode_(row.paymentStatus) === 'PENDING') {
        ignoredOld++;
      }
      continue;
    }
    if (normalizePaymentStatusCode_(row.paymentStatus) !== 'PENDING') {
      continue;
    }
    if (!row.payosOrderCode) {
      continue;
    }

    checked++;
    var syncResult = getPayosPaymentStatusForRequestRow_(row);

    if (!syncResult.ok) {
      errors++;
      continue;
    }

    if (syncResult.statusCode === 'PAID' || syncResult.statusCode === 'LINK_SENT') {
      updatePaymentRequestRow_(row.rowIndex, function(values, idx) {
        values[idx.paymentStatus] = 'PAID';
        if (!values[idx.paidAt]) {
          values[idx.paidAt] = new Date();
        }
        if (syncResult.paidAmount) {
          values[idx.paidAmount] = syncResult.paidAmount;
        }
        if (syncResult.paymentRef) {
          values[idx.paymentRef] = syncResult.paymentRef;
        }
        values[idx.paidContent] = values[idx.paidContent] || 'PAYOS_API_SYNC';
        values[idx.lastError] = '';
      }, {
        source: 'PAYOS_SYNC_PAID',
        note: 'Synced paid status from PayOS API'
      });
      paid++;
      continue;
    }

    if (syncResult.statusCode === 'FAILED') {
      updatePaymentRequestRow_(row.rowIndex, function(values, idx) {
        values[idx.paymentStatus] = 'FAILED';
        values[idx.lastError] = 'PayOS báo trạng thái thất bại/hủy.';
      }, {
        source: 'PAYOS_SYNC_FAILED',
        note: 'Synced failed status from PayOS API'
      });
      failed++;
    }
  }

  return {
    checked: checked,
    paid: paid,
    failed: failed,
    ignoredOld: ignoredOld,
    errors: errors
  };
}


function buildPaymentInstructionEmailHtml_(name, eventDateText, customMessage, paymentCode, checkoutUrl, hasQrInline) {
  var safeName = escapeHtml_(name);
  var safeDate = escapeHtml_(eventDateText);
  var safeMessage = escapeHtml_(customMessage);
  var feeText = escapeHtml_(String((CONFIG.PAYMENT && CONFIG.PAYMENT.FEE_TEXT) || '50.000đ'));
  var noteText = escapeHtml_(String((CONFIG.PAYMENT && CONFIG.PAYMENT.NOTE_TEXT) || 'Bạn vui lòng chuyển khoản trước khi thi đấu.'));
  var safeCode = escapeHtml_(paymentCode);
  var safeCheckoutUrl = escapeHtml_(checkoutUrl || '');
  var showQrInline = !!hasQrInline;
  var checkoutButton = safeCheckoutUrl
    ? '<p style="margin:10px 0 0"><a href="' + safeCheckoutUrl + '" target="_blank" rel="noopener noreferrer" style="display:inline-block;background:#0f766e;color:#fff;padding:10px 14px;border-radius:8px;text-decoration:none;font-weight:600">Thanh toán qua PayOS</a></p>'
    : '';
  var qrInlineBlock = showQrInline
    ? '<p style="margin:12px 0 0"><strong>Hoặc quét mã QR để thanh toán:</strong></p>' +
      '<p style="margin:8px 0 0"><img src="cid:payosqr" alt="Mã QR thanh toán PayOS" style="display:block;max-width:280px;width:100%;height:auto;border:1px solid #e5e7eb;border-radius:8px"></p>'
    : '';

  return '' +
    '<div style="font-family:Arial,sans-serif;color:#1f2937;line-height:1.6;max-width:620px">' +
    '<p>Chào <strong>' + safeName + '</strong>,</p>' +
    '<p>Bạn đã được chọn thi đấu vào ngày <strong>' + safeDate + '</strong>.</p>' +
    '<p>Do bạn chưa tham gia khóa học, bạn cần thanh toán phí trước khi nhận link nhóm.</p>' +
    '<div style="margin:14px 0;padding:12px;border:1px solid #f59e0b;border-radius:8px;background:#fffbeb">' +
    '<p style="margin:0 0 8px"><strong>Số tiền:</strong> ' + feeText + '</p>' +
    '<p style="margin:0 0 8px"><strong>Nội dung chuyển khoản bắt buộc:</strong> <code>' + safeCode + '</code></p>' +
    '<p style="margin:0 0 8px">' + noteText + '</p>' +
    '<p style="margin:0 0 8px">Vui lòng thanh toán trên PayOS:</p>' +
    checkoutButton +
    qrInlineBlock +
    '</div>' +
    '<p>Sau khi hệ thống ghi nhận thanh toán, link nhóm Zalo sẽ được gửi tự động qua email tiếp theo.</p>' +
    '<p>' + safeMessage + '</p>' +
    '<p>Trân trọng,<br>Ban tổ chức</p>' +
    '</div>';
}


function buildPaymentInstructionEmailText_(name, eventDateText, customMessage, paymentCode, checkoutUrl) {
  var feeText = String((CONFIG.PAYMENT && CONFIG.PAYMENT.FEE_TEXT) || '50.000đ');
  var noteText = String((CONFIG.PAYMENT && CONFIG.PAYMENT.NOTE_TEXT) || 'Bạn vui lòng chuyển khoản trước khi thi đấu.');
  var lines = [
    'Chào ' + String(name || ''),
    '',
    'Bạn đã được chọn thi đấu vào ngày ' + String(eventDateText || '') + '.',
    'Do bạn chưa tham gia khóa học, bạn cần thanh toán phí trước khi nhận link nhóm.',
    'Số tiền: ' + feeText,
    'Nội dung chuyển khoản bắt buộc: ' + String(paymentCode || ''),
    noteText
  ];

  if (checkoutUrl) {
    lines.push('Thanh toán qua PayOS: ' + String(checkoutUrl || ''));
  }

  if (customMessage) {
    lines.push('', String(customMessage || '').trim());
  }

  lines.push('', 'Trân trọng,', 'Ban tổ chức');
  return lines.join('\n');
}


function renderQrPngBlobFromRawCode_(rawCode, fileStem) {
  var text = String(rawCode || '').trim();
  if (!text) {
    return null;
  }

  var safeStem = String(fileStem || 'payos-qr').replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase() || 'payos-qr';
  var fileName = safeStem + '.png';

  if (/^data:image\/[a-z0-9.+-]+;base64,/i.test(text)) {
    var base64Data = text.split(',')[1] || '';
    if (!base64Data) {
      return null;
    }
    return Utilities.newBlob(Utilities.base64Decode(base64Data), 'image/png', fileName);
  }

  if (/^https?:\/\//i.test(text)) {
    try {
      var directResponse = UrlFetchApp.fetch(text, {
        method: 'get',
        muteHttpExceptions: true,
        followRedirects: true
      });
      var directStatus = Number(directResponse.getResponseCode() || 0);
      if (directStatus >= 200 && directStatus < 300) {
        return directResponse.getBlob().setName(fileName);
      }
    } catch (err) {
      // Ignore and continue fallback render.
    }
  }

  try {
    var qrEndpoint = 'https://quickchart.io/qr?size=360&text=' + encodeURIComponent(text);
    var renderResponse = UrlFetchApp.fetch(qrEndpoint, {
      method: 'get',
      muteHttpExceptions: true,
      followRedirects: true
    });
    var renderStatus = Number(renderResponse.getResponseCode() || 0);
    if (renderStatus < 200 || renderStatus >= 300) {
      return null;
    }
    return renderResponse.getBlob().setName(fileName);
  } catch (error) {
    return null;
  }
}


function getPaymentQrBlobForRequest_(requestRow, payosData) {
  var paymentCode = requestRow ? String(requestRow.paymentCode || '') : '';
  var qrRaw = payosData ? String(payosData.qrCode || '') : '';
  if (!qrRaw && requestRow) {
    qrRaw = String(requestRow.payosQrCode || '');
  }

  if (qrRaw) {
    var rendered = renderQrPngBlobFromRawCode_(qrRaw, 'payos-qr-' + (paymentCode || 'payment'));
    if (rendered) {
      return rendered;
    }
  }

  try {
    return getPaymentQrBlob_();
  } catch (error) {
    return null;
  }
}


function extractPaymentCodeFromText_(text) {
  var raw = String(text || '').toUpperCase();
  if (!raw) {
    return '';
  }

  var prefix = String((CONFIG.PAYMENT && CONFIG.PAYMENT.CODE_PREFIX) || 'GE')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase();
  if (!prefix) {
    prefix = 'GE';
  }

  var regex = new RegExp(prefix + '[A-Z0-9]{6,20}');
  var match = raw.match(regex);
  return match ? match[0] : '';
}


function parseWebhookPayload_(e) {
  var bodyText = (e && e.postData && e.postData.contents) ? String(e.postData.contents || '') : '';
  if (bodyText) {
    try {
      return JSON.parse(bodyText);
    } catch (err) {
      // Ignore JSON parse failure and fall back to query params.
    }
  }
  return (e && e.parameter) ? e.parameter : {};
}


function pickFirstNonEmpty_(values) {
  for (var i = 0; i < values.length; i++) {
    var text = String(values[i] || '').trim();
    if (text) {
      return text;
    }
  }
  return '';
}


function parseNumberSafe_(value) {
  if (value === null || value === undefined || value === '') {
    return 0;
  }
  var num = Number(String(value).replace(/,/g, '.').replace(/[^\d.-]/g, ''));
  return isNaN(num) ? 0 : num;
}


function findLatestPaymentRequestByPayosRefs_(orderCode, paymentLinkId) {
  var targetOrder = String(orderCode || '').trim();
  var targetLink = String(paymentLinkId || '').trim();
  if (!targetOrder && !targetLink) {
    return null;
  }

  var rows = readPaymentRequestRows_();
  var candidates = [];

  for (var i = 0; i < rows.length; i++) {
    var rowOrder = String(rows[i].payosOrderCode || '').trim();
    var rowLink = String(rows[i].payosPaymentLinkId || '').trim();
    var matched = false;

    if (targetOrder && targetLink) {
      if (rowOrder && rowOrder !== targetOrder) {
        continue;
      }
      if (rowLink && rowLink !== targetLink) {
        continue;
      }
      matched = (rowOrder === targetOrder) || (rowLink === targetLink);
    } else if (targetOrder) {
      matched = rowOrder === targetOrder;
    } else {
      matched = rowLink === targetLink;
    }

    if (matched) {
      candidates.push(rows[i]);
    }
  }

  if (!candidates.length) {
    return null;
  }

  candidates.sort(function(a, b) {
    var aPending = normalizePaymentStatusCode_(a.paymentStatus) === 'PENDING' ? 1 : 0;
    var bPending = normalizePaymentStatusCode_(b.paymentStatus) === 'PENDING' ? 1 : 0;
    if (bPending !== aPending) {
      return bPending - aPending;
    }
    return getPaymentRequestTimeMs_(b) - getPaymentRequestTimeMs_(a);
  });

  return candidates[0];
}


function isWebhookFromLatestPayosOrder_(requestRow, orderCode, paymentLinkId) {
  if (!requestRow) {
    return false;
  }

  var rowOrderCode = String(requestRow.payosOrderCode || '').trim();
  var rowPaymentLinkId = String(requestRow.payosPaymentLinkId || '').trim();
  var webhookOrderCode = String(orderCode || '').trim();
  var webhookPaymentLinkId = String(paymentLinkId || '').trim();

  if (rowPaymentLinkId && webhookPaymentLinkId && rowPaymentLinkId !== webhookPaymentLinkId) {
    return false;
  }
  if (rowOrderCode && webhookOrderCode && rowOrderCode !== webhookOrderCode) {
    return false;
  }

  return true;
}


function isWebhookPaymentSuccess_(statusRaw) {
  var raw = String(statusRaw || '').trim();
  if (!raw) {
    return true;
  }

  var normalized = normalizeSearchText_(statusRaw);
  if (!normalized) {
    return false;
  }

  if (
    normalized === '00' ||
    normalized === '0' ||
    normalized === 'success' ||
    normalized === 'thanh_cong' ||
    normalized === 'paid' ||
    normalized === 'completed'
  ) {
    return true;
  }

  if (/^\d+$/.test(normalized)) {
    return normalized === '00' || normalized === '0';
  }

  if (
    normalized.indexOf('fail') !== -1 ||
    normalized.indexOf('error') !== -1 ||
    normalized.indexOf('cancel') !== -1 ||
    normalized.indexOf('pending') !== -1 ||
    normalized.indexOf('processing') !== -1
  ) {
    return false;
  }
  return true;
}


function sendGroupLinkAfterPayment_(requestRow, logStatus) {
  var eventDate = toDate_(requestRow.eventDate) || parseDateInput_(requestRow.eventDateKey);
  var eventDateText = eventDate ? formatDate_(eventDate, 'dd/MM/yyyy') : '';
  var subject = CONFIG.DEFAULT_SUBJECT.replace('{{eventDate}}', eventDateText || 'sắp tới');
  var supportMessage = String(requestRow.supportMessage || CONFIG.DEFAULT_MESSAGE || '').trim();
  var groupLink = String(requestRow.groupLink || '').trim();

  if (!groupLink) {
    throw new Error('Thiếu link nhóm Zalo trong yêu cầu thanh toán.');
  }

  var htmlBody = buildSelectionEmailHtml_(
    requestRow.ingame || requestRow.name || requestRow.email,
    eventDateText,
    groupLink,
    supportMessage,
    false
  );

  MailApp.sendEmail({
    to: requestRow.email,
    subject: subject,
    htmlBody: htmlBody,
    name: CONFIG.MAIL_SENDER_NAME || 'Lớp học Thành Man'
  });

  var logSheet = getOrCreateSheet_(CONFIG.SHEETS.SELECTION_LOG, CONFIG.LOG_HEADERS);
  logSheet.getRange(logSheet.getLastRow() + 1, 1, 1, CONFIG.LOG_HEADERS.length).setValues([[
    new Date(),
    eventDate || '',
    requestRow.weekKey || '',
    requestRow.email || '',
    requestRow.name || '',
    false,
    String(logStatus || 'SENT_GROUP_AFTER_PAYMENT_AUTO'),
    subject,
    groupLink
  ]]);
}


function processPaidPaymentRequests() {
  ensureSupportSheets_();
  var rows = readPaymentRequestRows_();
  var payosSync = syncLatestPendingPaymentsFromPayos_(rows);
  rows = readPaymentRequestRows_();
  var expired = expirePendingPaymentRequests_(rows);
  rows = readPaymentRequestRows_();
  var effectiveMap = buildEffectivePaymentRequestMapByWeekEmail_(rows);
  var effectiveRows = [];
  Object.keys(effectiveMap).forEach(function(key) {
    effectiveRows.push(effectiveMap[key]);
  });

  var now = new Date();
  var cooldownMinutes = getGroupMailCooldownMinutes_();
  var cooldownPending = 0;
  var processed = 0;
  var sent = 0;
  var errors = 0;

  for (var i = 0; i < effectiveRows.length; i++) {
    if (!effectiveRows[i].needPayment) {
      continue;
    }

    var statusCode = normalizePaymentStatusCode_(effectiveRows[i].paymentStatus);
    if (statusCode === 'LINK_SENT') {
      continue;
    }

    if (statusCode !== 'PAID') {
      continue;
    }

    if (effectiveRows[i].groupMailSentAt) {
      updatePaymentRequestRow_(effectiveRows[i].rowIndex, function(values, idx) {
        values[idx.paymentStatus] = 'LINK_SENT';
        values[idx.lastError] = '';
      }, {
        source: 'RECONCILE_LINK_SENT',
        note: 'Already has group mail sent time'
      });
      continue;
    }

    if (!isGroupMailCooldownElapsed_(effectiveRows[i], now)) {
      cooldownPending++;
      continue;
    }

    processed++;
    try {
      sendGroupLinkAfterPayment_(effectiveRows[i]);
      updatePaymentRequestRow_(effectiveRows[i].rowIndex, function(values, idx) {
        values[idx.paymentStatus] = 'LINK_SENT';
        values[idx.groupMailSentAt] = new Date();
        values[idx.lastMailAt] = new Date();
        values[idx.lastError] = '';
      }, {
        source: 'AUTO_SEND_GROUP',
        note: 'Auto job sent group link after paid (cooldown passed)'
      });
      sent++;
    } catch (error) {
      updatePaymentRequestRow_(effectiveRows[i].rowIndex, function(values, idx) {
        values[idx.lastError] = String(error.message || error);
      });
      errors++;
    }
  }

  return {
    payosSyncChecked: Number(payosSync.checked || 0),
    payosSyncPaid: Number(payosSync.paid || 0),
    payosSyncFailed: Number(payosSync.failed || 0),
    payosSyncIgnoredOld: Number(payosSync.ignoredOld || 0),
    payosSyncErrors: Number(payosSync.errors || 0),
    expired: expired,
    cooldownMinutes: cooldownMinutes,
    cooldownPending: cooldownPending,
    processed: processed,
    sent: sent,
    errors: errors
  };
}


function createWebhookJsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload || { ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}


function doPost(e) {
  try {
    ensureSupportSheets_();
    var payload = parseWebhookPayload_(e);
    var rawPayload = (payload && payload.raw && typeof payload.raw === 'object') ? payload.raw : {};
    var data = (payload && typeof payload.data === 'object')
      ? payload.data
      : ((rawPayload && typeof rawPayload.data === 'object') ? rawPayload.data : {});

    var token = String((CONFIG.PAYMENT && CONFIG.PAYMENT.WEBHOOK_TOKEN) || '').trim();
    var queryToken = e && e.parameter ? String(e.parameter.token || '').trim() : '';
    var bodyToken = pickFirstNonEmpty_([
      payload.token,
      data.token,
      rawPayload.token
    ]);
    var providedToken = pickFirstNonEmpty_([
      queryToken,
      bodyToken
    ]);
    if (token && providedToken && token !== providedToken) {
      return createWebhookJsonResponse_({
        ok: true,
        ignored: true,
        reason: 'Webhook token không hợp lệ.'
      });
    }

    var successRaw = null;
    if (Object.prototype.hasOwnProperty.call(payload, 'success')) {
      successRaw = payload.success;
    } else if (Object.prototype.hasOwnProperty.call(data, 'success')) {
      successRaw = data.success;
    } else if (Object.prototype.hasOwnProperty.call(rawPayload, 'success')) {
      successRaw = rawPayload.success;
    }
    if (
      successRaw !== null &&
      successRaw !== undefined &&
      String(successRaw).toLowerCase() !== 'true' &&
      String(successRaw) !== '1'
    ) {
      return createWebhookJsonResponse_({
        ok: true,
        ignored: true,
        reason: 'Webhook success=false'
      });
    }

    var statusRaw = pickFirstNonEmpty_([
      payload.code,
      payload.desc,
      payload.status,
      data.code,
      data.desc,
      data.status,
      data.state,
      data.result,
      rawPayload.code,
      rawPayload.desc,
      rawPayload.status
    ]);
    if (!isWebhookPaymentSuccess_(statusRaw)) {
      return createWebhookJsonResponse_({
        ok: true,
        ignored: true,
        reason: 'Payment status not successful'
      });
    }

    var content = pickFirstNonEmpty_([
      data.description,
      data.transferContent,
      data.content,
      data.note,
      data.message,
      payload.description,
      payload.transferContent,
      payload.content,
      payload.note,
      payload.message,
      payload.desc
    ]);
    var paymentCode = extractPaymentCodeFromText_(content);
    var paymentRef = pickFirstNonEmpty_([
      data.reference,
      data.transactionId,
      data.transaction_id,
      data.id,
      payload.reference,
      payload.transactionId,
      payload.transaction_id,
      payload.id
    ]);
    var amount = parseNumberSafe_(pickFirstNonEmpty_([
      data.amount,
      data.transferAmount,
      payload.amount
    ]));
    var orderCode = pickFirstNonEmpty_([
      data.orderCode,
      payload.orderCode
    ]);
    var paymentLinkId = pickFirstNonEmpty_([
      data.paymentLinkId,
      payload.paymentLinkId
    ]);

    var requestRow = null;
    if (paymentCode) {
      requestRow = findLatestPaymentRequestByCode_(paymentCode);
    }
    if (!requestRow) {
      requestRow = findLatestPaymentRequestByPayosRefs_(orderCode, paymentLinkId);
    }
    if (!requestRow) {
      return createWebhookJsonResponse_({
        ok: true,
        ignored: true,
        reason: 'Payment request not found',
        code: paymentCode,
        orderCode: orderCode,
        paymentLinkId: paymentLinkId
      });
    }
    if (!paymentCode) {
      paymentCode = String(requestRow.paymentCode || '');
    }

    if (!isWebhookFromLatestPayosOrder_(requestRow, orderCode, paymentLinkId)) {
      return createWebhookJsonResponse_({
        ok: true,
        matched: true,
        ignored: true,
        reason: 'Old transaction ignored (not latest payment link/order)',
        paymentCode: paymentCode,
        email: requestRow.email
      });
    }

    var currentStatusCode = normalizePaymentStatusCode_(requestRow.paymentStatus);
    if (currentStatusCode === 'LINK_SENT') {
      return createWebhookJsonResponse_({
        ok: true,
        matched: true,
        ignored: true,
        reason: 'Group link already sent',
        paymentCode: paymentCode,
        email: requestRow.email
      });
    }

    if (currentStatusCode === 'PAID' && requestRow.groupMailSentAt) {
      updatePaymentRequestRow_(requestRow.rowIndex, function(values, idx) {
        values[idx.paymentStatus] = 'LINK_SENT';
        values[idx.lastError] = '';
      }, {
        source: 'WEBHOOK_RECONCILE',
        note: 'Paid with group mail already sent'
      });
      return createWebhookJsonResponse_({
        ok: true,
        matched: true,
        ignored: true,
        reason: 'Payment already finalized',
        paymentCode: paymentCode,
        email: requestRow.email
      });
    }

    var updated = updatePaymentRequestRow_(requestRow.rowIndex, function(values, idx) {
      values[idx.paymentStatus] = 'PAID';
      if (!values[idx.paidAt]) {
        values[idx.paidAt] = new Date();
      }
      if (amount) {
        values[idx.paidAmount] = amount;
      }
      if (content) {
        values[idx.paidContent] = content;
      } else if (!values[idx.paidContent]) {
        values[idx.paidContent] = 'WEBHOOK_PAYOS';
      }
      if (paymentRef) {
        values[idx.paymentRef] = paymentRef;
      }
      if (orderCode) {
        values[idx.payosOrderCode] = String(orderCode);
      }
      if (paymentLinkId) {
        values[idx.payosPaymentLinkId] = String(paymentLinkId);
      }
      values[idx.lastError] = '';
    }, {
      source: 'WEBHOOK_PAID',
      note: 'Webhook confirmed payment from PayOS'
    });

    return createWebhookJsonResponse_({
      ok: true,
      matched: true,
      paymentCode: paymentCode,
      email: updated.email,
      paymentStatus: 'PAID',
      queuedGroupMail: true,
      cooldownMinutes: getGroupMailCooldownMinutes_()
    });
  } catch (error) {
    Logger.log('doPost error: ' + String(error && error.message ? error.message : error));
    return createWebhookJsonResponse_({
      ok: false,
      error: String(error && error.message ? error.message : error)
    });
  }
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


function getPaymentQrBlob_() {
  var fileId = String((CONFIG.PAYMENT && CONFIG.PAYMENT.QR_DRIVE_FILE_ID) || '').trim();
  if (!fileId) {
    return null;
  }

  try {
    return DriveApp.getFileById(fileId).getBlob();
  } catch (error) {
    throw new Error('Không đọc được ảnh QR từ Google Drive: ' + error.message);
  }
}
