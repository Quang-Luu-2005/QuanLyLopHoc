/**
 * Auto-split module from legacy Code.gs
 */

function ensureSupportSheets_() {
  getOrCreateSheet_(CONFIG.SHEETS.PLAYERS, CONFIG.PLAYER_HEADERS);
  getOrCreateSheet_(CONFIG.SHEETS.SELECTION_LOG, CONFIG.LOG_HEADERS);
  getOrCreateSheet_(CONFIG.SHEETS.WEEKLY_PRIORITY, CONFIG.WEEKLY_PRIORITY_HEADERS);
  getOrCreateSheet_(CONFIG.SHEETS.SELECTION_COUNT_LOG, CONFIG.SELECTION_COUNT_HEADERS);
  getOrCreateSheet_(CONFIG.SHEETS.PAYMENT_REQUESTS, CONFIG.PAYMENT_REQUEST_HEADERS);
}


function getOrCreateSheet_(name, headers) {
  var ss = getTargetSpreadsheet_();
  var sheet = ss.getSheetByName(name);

  if (!sheet) {
    sheet = ss.insertSheet(name);
  }

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

  return sheet;
}


function enforceFormEmailCollection_() {
  try {
    var form = getTargetForm_();
    if (form.collectsEmail()) {
      return { ok: true, message: 'Form đã bật collect email.' };
    }

    form.setCollectEmail(true);
    return { ok: true, message: 'Đã bật collect email trên Form.' };
  } catch (error) {
    return {
      ok: false,
      message: 'Không thể tự động bật collect email: ' + error.message
    };
  }
}


function getResponsesSheet_() {
  var ss = getTargetSpreadsheet_();
  var sheets = ss.getSheets();
  var fallbackByName = null;
  var fallbackByTimestamp = null;
  var firstPossible = null;

  for (var i = 0; i < sheets.length; i++) {
    var name = sheets[i].getName().toLowerCase();
    if (
      name.indexOf('form responses') !== -1 ||
      name.indexOf('responses') !== -1 ||
      name.indexOf('response') !== -1 ||
      name.indexOf('phan hoi') !== -1 ||
      name.indexOf('phản hồi') !== -1 ||
      name.indexOf('cau tra loi') !== -1 ||
      name.indexOf('câu trả lời') !== -1 ||
      name.indexOf('bieu mau') !== -1 ||
      name.indexOf('biểu mẫu') !== -1
    ) {
      fallbackByName = sheets[i];
      break;
    }
  }

  for (var j = 0; j < sheets.length; j++) {
    var sheetName = sheets[j].getName();
    if (
      sheetName === CONFIG.SHEETS.PLAYERS ||
      sheetName === CONFIG.SHEETS.SELECTION_LOG ||
      sheetName === CONFIG.SHEETS.WEEKLY_PRIORITY ||
      sheetName === CONFIG.SHEETS.SELECTION_COUNT_LOG ||
      sheetName === CONFIG.SHEETS.PAYMENT_REQUESTS
    ) {
      continue;
    }

    if (!firstPossible) {
      firstPossible = sheets[j];
    }

    if (sheets[j].getLastColumn() < 1) {
      continue;
    }

    var headers = sheets[j].getRange(1, 1, 1, sheets[j].getLastColumn()).getValues()[0];
    var columns = detectColumns_(headers);
    if (columns.emailIndex !== -1 && columns.timestampIndex !== -1) {
      return sheets[j];
    }

    if (!fallbackByTimestamp && columns.timestampIndex !== -1) {
      fallbackByTimestamp = sheets[j];
    }
  }

  if (fallbackByName) {
    return fallbackByName;
  }

  if (fallbackByTimestamp) {
    return fallbackByTimestamp;
  }

  if (firstPossible) {
    return firstPossible;
  }

  throw new Error('Không tìm thấy sheet responses của Google Form.');
}


function detectColumns_(headers) {
  var timestampIndex = -1;
  var emailIndex = -1;
  var nameIndex = -1;
  var ingameIndex = -1;
  var rankIndex = -1;
  var studentStatusIndex = -1;
  var paymentStatusCodeIndex = -1;
  var paymentStatusIndex = -1;

  for (var i = 0; i < headers.length; i++) {
    var h = String(headers[i] || '').trim().toLowerCase();
    var hNorm = normalizeSearchText_(h);

    if (timestampIndex === -1 && /(timestamp|thời\s*gian|thoi\s*gian|submitted|submission)/i.test(h)) {
      timestampIndex = i;
    }

    if (emailIndex === -1 && /email/i.test(h)) {
      emailIndex = i;
    }

    if (nameIndex === -1 && /(họ\s*tên|ho\s*ten|full\s*name|name|tên|ten)/i.test(h) && !/email/i.test(h)) {
      nameIndex = i;
    }

    if (ingameIndex === -1 && /(ingame|in\s*game|in-game|ign|nick|tên\s*game|ten\s*game|tên\s*ingame|ten\s*ingame)/i.test(h) && !/email/i.test(h)) {
      ingameIndex = i;
    }

    if (rankIndex === -1 && /(rank|hạng|hang|tier|elo|mmr)/i.test(h) && !/email/i.test(h)) {
      rankIndex = i;
    }

    if (
      studentStatusIndex === -1 &&
      (
        hNorm.indexOf('hoc vien') !== -1 ||
        hNorm.indexOf('tham gia khoa hoc') !== -1 ||
        hNorm.indexOf('thanh man') !== -1
      )
    ) {
      studentStatusIndex = i;
    }

    if (
      paymentStatusCodeIndex === -1 &&
      (
        hNorm.indexOf('ge payment status code') !== -1 ||
        hNorm.indexOf('ge paymentstatuscode') !== -1 ||
        hNorm.indexOf('payment status code') !== -1 ||
        hNorm.indexOf('paymentstatuscode') !== -1 ||
        hNorm.indexOf('trang thai thanh toan code') !== -1
      )
    ) {
      paymentStatusCodeIndex = i;
    }

    if (
      paymentStatusIndex === -1 &&
      hNorm.indexOf('code') === -1 &&
      (
        hNorm.indexOf('ge payment status') !== -1 ||
        hNorm.indexOf('ge paymentstatus') !== -1 ||
        hNorm.indexOf('payment status') !== -1 ||
        hNorm.indexOf('paymentstatus') !== -1 ||
        hNorm.indexOf('trang thai thanh toan') !== -1
      )
    ) {
      paymentStatusIndex = i;
    }
  }

  if (timestampIndex === -1 && headers.length > 0) {
    timestampIndex = 0;
  }

  return {
    timestampIndex: timestampIndex,
    emailIndex: emailIndex,
    nameIndex: nameIndex,
    ingameIndex: ingameIndex,
    rankIndex: rankIndex,
    studentStatusIndex: studentStatusIndex,
    paymentStatusCodeIndex: paymentStatusCodeIndex,
    paymentStatusIndex: paymentStatusIndex
  };
}


function getAllRequests_() {
  var sheet = getResponsesSheet_();
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();

  if (lastRow < 2 || lastCol < 1) {
    return [];
  }

  var values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  var headers = values[0];
  var columns = detectColumns_(headers);

  if (columns.emailIndex === -1) {
    throw new Error(
      'Không tìm thấy cột Email trong responses. Hãy bật "Collect email addresses" trên Google Form.'
    );
  }

  var requests = [];

  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var email = normalizeEmail_(row[columns.emailIndex]);
    if (!email) {
      continue;
    }

    var timestamp = toDate_(row[columns.timestampIndex]);
    if (!timestamp) {
      continue;
    }

    var name = '';
    if (columns.nameIndex !== -1) {
      name = String(row[columns.nameIndex] || '').trim();
    }

    var ingame = '';
    if (columns.ingameIndex !== -1) {
      ingame = String(row[columns.ingameIndex] || '').trim();
    }

    if (!ingame) {
      ingame = name;
    }
    if (!name) {
      name = ingame;
    }
    if (!name) {
      name = email.split('@')[0];
    }
    if (!ingame) {
      ingame = name;
    }

    var rankRaw = '';
    if (columns.rankIndex !== -1) {
      rankRaw = String(row[columns.rankIndex] || '').trim();
    }

    var studentStatusRaw = '';
    if (columns.studentStatusIndex !== -1) {
      studentStatusRaw = String(row[columns.studentStatusIndex] || '').trim();
    }

    var paymentStatusCodeRaw = '';
    if (columns.paymentStatusCodeIndex !== -1) {
      paymentStatusCodeRaw = String(row[columns.paymentStatusCodeIndex] || '').trim();
    }

    var paymentStatusRaw = '';
    if (columns.paymentStatusIndex !== -1) {
      paymentStatusRaw = String(row[columns.paymentStatusIndex] || '').trim();
    }

    var weekStart = getWeekStart_(timestamp);
    requests.push({
      rowNumber: i + 1,
      timestamp: timestamp,
      weekStart: weekStart,
      weekKey: formatDate_(weekStart, 'yyyy-MM-dd'),
      email: email,
      name: name,
      ingame: ingame,
      rankRaw: rankRaw,
      studentStatusRaw: studentStatusRaw,
      paymentStatusCodeRaw: paymentStatusCodeRaw,
      paymentStatusRaw: paymentStatusRaw
    });
  }

  return requests;
}


function syncPlayersFromResponses_() {
  var requests = getAllRequests_();
  var latestByEmail = {};

  for (var i = 0; i < requests.length; i++) {
    var existing = latestByEmail[requests[i].email];
    if (!existing || requests[i].timestamp.getTime() > existing.timestamp.getTime()) {
      latestByEmail[requests[i].email] = requests[i];
    }
  }

  var players = readPlayersRows_();
  var playerMap = toPlayerMap_(players);
  var added = 0;

  Object.keys(latestByEmail).forEach(function(email) {
    var req = latestByEmail[email];
    var player = playerMap[email];

    if (!player) {
      player = {
        email: email,
        name: req.ingame || req.name,
        priority: false,
        selectedCount: 0,
        lastSelectedDate: '',
        lastRequestAt: req.timestamp
      };
      players.push(player);
      playerMap[email] = player;
      added++;
      return;
    }

    if (req.ingame || req.name) {
      player.name = req.ingame || req.name;
    }
    player.lastRequestAt = req.timestamp;
  });

  writePlayersRows_(players);

  return {
    totalRequests: requests.length,
    totalPlayers: players.length,
    added: added
  };
}


function readPlayersRows_() {
  var sheet = getOrCreateSheet_(CONFIG.SHEETS.PLAYERS, CONFIG.PLAYER_HEADERS);
  var lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return [];
  }

  var values = sheet.getRange(2, 1, lastRow - 1, CONFIG.PLAYER_HEADERS.length).getValues();
  var players = [];

  for (var i = 0; i < values.length; i++) {
    var email = normalizeEmail_(values[i][0]);
    if (!email) {
      continue;
    }

    players.push({
      email: email,
      name: String(values[i][1] || '').trim(),
      priority: toBoolean_(values[i][2]),
      selectedCount: Number(values[i][3]) || 0,
      lastSelectedDate: toDate_(values[i][4]) || '',
      lastRequestAt: toDate_(values[i][5]) || ''
    });
  }

  return players;
}


function writePlayersRows_(players) {
  var sheet = getOrCreateSheet_(CONFIG.SHEETS.PLAYERS, CONFIG.PLAYER_HEADERS);
  players = Array.isArray(players) ? players : [];

  players.sort(function(a, b) {
    if (Number(a.selectedCount || 0) !== Number(b.selectedCount || 0)) {
      return Number(a.selectedCount || 0) - Number(b.selectedCount || 0);
    }
    return String(a.name || a.email).localeCompare(String(b.name || b.email));
  });

  var rows = players.map(function(player) {
    return [
      normalizeEmail_(player.email),
      String(player.name || ''),
      !!player.priority,
      Number(player.selectedCount || 0),
      player.lastSelectedDate || '',
      player.lastRequestAt || ''
    ];
  });

  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, CONFIG.PLAYER_HEADERS.length).clearContent();
  }

  if (!rows.length) {
    return;
  }

  sheet.getRange(2, 1, rows.length, CONFIG.PLAYER_HEADERS.length).setValues(rows);
  sheet.getRange(2, 3, rows.length, 1).insertCheckboxes();
}


function toPlayerMap_(players) {
  var map = {};
  for (var i = 0; i < players.length; i++) {
    map[players[i].email] = players[i];
  }
  return map;
}


function getAvailableWeeks_() {
  var requests = getAllRequests_();
  var weeks = {};

  for (var i = 0; i < requests.length; i++) {
    if (!weeks[requests[i].weekKey]) {
      weeks[requests[i].weekKey] = requests[i].weekStart;
    }
  }

  var keys = Object.keys(weeks).sort(function(a, b) {
    return parseDateInput_(b).getTime() - parseDateInput_(a).getTime();
  });

  return keys.map(function(key) {
    var start = parseDateInput_(key);
    return {
      key: key,
      label: buildWeekLabel_(start)
    };
  });
}


function getWeekRequests_(weekKey) {
  var requests = getAllRequests_();
  var latestByEmail = {};
  var weekPriorityMap = readWeeklyPriorities_(weekKey);
  var paymentStatusMap = getPaymentStatusMapForWeek_(weekKey);

  for (var i = 0; i < requests.length; i++) {
    if (requests[i].weekKey !== weekKey) {
      continue;
    }

    var existing = latestByEmail[requests[i].email];
    if (!existing || requests[i].timestamp.getTime() > existing.timestamp.getTime()) {
      latestByEmail[requests[i].email] = requests[i];
    }
  }

  var players = readPlayersRows_();
  var playerMap = toPlayerMap_(players);
  var rows = [];

  Object.keys(latestByEmail).forEach(function(email) {
    var req = latestByEmail[email];
    var player = playerMap[email];
    var ingame = req.ingame || req.name || (player ? player.name : '') || email.split('@')[0];

    var paymentRequired = isPaymentRequired_(req.studentStatusRaw);
    var paymentInfo = paymentStatusMap[email] || buildPaymentInfoFromResponseRequest_(req) || { code: 'PENDING', label: 'Chưa thanh toán' };

    rows.push({
      email: email,
      name: (player && player.name) ? player.name : req.name,
      ingame: ingame,
      priority: !!weekPriorityMap[email],
      selectedCount: player ? Number(player.selectedCount || 0) : 0,
      requestedAt: formatDate_(req.timestamp, 'dd/MM/yyyy HH:mm'),
      requestedAtEpoch: req.timestamp.getTime(),
      rankRaw: req.rankRaw || '',
      rankNormalized: normalizeFixedRank_(req.rankRaw),
      studentStatusRaw: req.studentStatusRaw || '',
      paymentRequired: paymentRequired,
      paymentStatusCode: paymentRequired ? String(paymentInfo.code || 'PENDING') : 'NONE',
      paymentStatus: paymentRequired ? String(paymentInfo.label || 'Chưa thanh toán') : '-'
    });
  });

  rows.sort(function(a, b) {
    if (Number(!!b.priority) !== Number(!!a.priority)) {
      return Number(!!b.priority) - Number(!!a.priority);
    }
    if (Number(a.selectedCount || 0) !== Number(b.selectedCount || 0)) {
      return Number(a.selectedCount || 0) - Number(b.selectedCount || 0);
    }
    return Number(a.requestedAtEpoch || 0) - Number(b.requestedAtEpoch || 0);
  });

  return rows;
}


function buildPaymentRequirementMap_(weekKey) {
  var map = {};
  if (!weekKey) {
    return map;
  }

  var rows = getWeekRequests_(weekKey);
  for (var i = 0; i < rows.length; i++) {
    map[rows[i].email] = !!rows[i].paymentRequired;
  }
  return map;
}


function buildPaymentInfoFromResponseRequest_(requestRow) {
  if (!requestRow) {
    return null;
  }

  var rawCode = String(requestRow.paymentStatusCodeRaw || '').trim();
  var rawLabel = String(requestRow.paymentStatusRaw || '').trim();
  if (!rawCode && !rawLabel) {
    return null;
  }

  var code = normalizePaymentStatusCode_(rawCode || rawLabel);
  return {
    code: code,
    label: paymentStatusLabelFromCode_(code)
  };
}


function getResponsePaymentColumnNames_() {
  return {
    paymentStatusCode: 'GE_PaymentStatusCode',
    paymentStatus: 'GE_PaymentStatus',
    paidAt: 'GE_PaidAt',
    paymentCode: 'GE_PaymentCode',
    paymentRef: 'GE_PaymentRef',
    paymentUpdatedAt: 'GE_PaymentUpdatedAt'
  };
}


function ensureResponsePaymentColumns_(sheet) {
  var names = getResponsePaymentColumnNames_();
  var order = [
    'paymentStatusCode',
    'paymentStatus',
    'paidAt',
    'paymentCode',
    'paymentRef',
    'paymentUpdatedAt'
  ];

  var lastCol = Math.max(1, sheet.getLastColumn());
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var changed = false;
  var map = {};

  for (var i = 0; i < order.length; i++) {
    var key = order[i];
    var headerName = names[key];
    var index = -1;

    for (var j = 0; j < headers.length; j++) {
      if (String(headers[j] || '').trim() === headerName) {
        index = j;
        break;
      }
    }

    if (index === -1) {
      headers.push(headerName);
      index = headers.length - 1;
      changed = true;
    }

    map[key] = index;
  }

  if (changed) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }

  return map;
}


function findLatestResponseRowForWeekEmail_(values, columns, email, weekKey) {
  var emailNorm = normalizeEmail_(email);
  var targetWeek = String(weekKey || '').trim();
  if (!emailNorm || !targetWeek) {
    return -1;
  }
  if (!columns || columns.emailIndex === -1 || columns.timestampIndex === -1) {
    return -1;
  }

  var latestRowNumber = -1;
  var latestEpoch = 0;

  for (var i = 1; i < values.length; i++) {
    var rowEmail = normalizeEmail_(values[i][columns.emailIndex]);
    if (rowEmail !== emailNorm) {
      continue;
    }

    var timestamp = toDate_(values[i][columns.timestampIndex]);
    if (!timestamp) {
      continue;
    }

    var rowWeekKey = formatDate_(getWeekStart_(timestamp), 'yyyy-MM-dd');
    if (rowWeekKey !== targetWeek) {
      continue;
    }

    var epoch = timestamp.getTime();
    if (latestRowNumber === -1 || epoch >= latestEpoch) {
      latestRowNumber = i + 1;
      latestEpoch = epoch;
    }
  }

  return latestRowNumber;
}


function syncPaymentStatusToResponses_(requestRow) {
  if (!requestRow || !requestRow.email || !requestRow.weekKey) {
    return { ok: false, reason: 'missing_request_data' };
  }

  var sheet = getResponsesSheet_();
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 1) {
    return { ok: false, reason: 'empty_responses' };
  }

  var values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  var columns = detectColumns_(values[0]);
  var targetRow = findLatestResponseRowForWeekEmail_(values, columns, requestRow.email, requestRow.weekKey);
  if (targetRow < 2) {
    return { ok: false, reason: 'target_row_not_found' };
  }

  var responsePaymentCols = ensureResponsePaymentColumns_(sheet);
  var statusCode = normalizePaymentStatusCode_(requestRow.paymentStatus);
  var statusLabel = paymentStatusLabelFromCode_(statusCode);

  sheet.getRange(targetRow, responsePaymentCols.paymentStatusCode + 1).setValue(statusCode);
  sheet.getRange(targetRow, responsePaymentCols.paymentStatus + 1).setValue(statusLabel);
  sheet.getRange(targetRow, responsePaymentCols.paidAt + 1).setValue(requestRow.paidAt || '');
  sheet.getRange(targetRow, responsePaymentCols.paymentCode + 1).setValue(String(requestRow.paymentCode || ''));
  sheet.getRange(targetRow, responsePaymentCols.paymentRef + 1).setValue(String(requestRow.paymentRef || ''));
  sheet.getRange(targetRow, responsePaymentCols.paymentUpdatedAt + 1).setValue(new Date());

  return { ok: true, rowNumber: targetRow };
}


function syncPaymentStatusToResponsesSafe_(requestRow) {
  try {
    return syncPaymentStatusToResponses_(requestRow);
  } catch (error) {
    Logger.log('syncPaymentStatusToResponses failed: ' + String(error && error.message ? error.message : error));
    return { ok: false, reason: 'exception' };
  }
}
