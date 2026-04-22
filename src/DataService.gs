/**
 * Dịch vụ dữ liệu (ưu tiên MongoDB)
 * Google Sheet responses chỉ là nguồn nhập liệu.
 */

function ensureSupportSheets_() {
  return { ok: true };
}

function getOrCreateSheet_(name, headers) {
  var ss = getTargetSpreadsheet_();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }

  if (Array.isArray(headers) && headers.length) {
    var current = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
    var changed = false;
    for (var i = 0; i < headers.length; i++) {
      if (current[i] !== headers[i]) {
        changed = true;
        break;
      }
    }
    if (changed) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    }
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
      name.indexOf('cau tra loi') !== -1 ||
      name.indexOf('bieu mau') !== -1
    ) {
      fallbackByName = sheets[i];
      break;
    }
  }

  for (var j = 0; j < sheets.length; j++) {
    var sheetName = sheets[j].getName();
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

  for (var i = 0; i < headers.length; i++) {
    var h = String(headers[i] || '').trim().toLowerCase();
    var hNorm = normalizeSearchText_(h);

    if (timestampIndex === -1 && /(timestamp|thoi\s*gian|submitted|submission)/i.test(hNorm)) {
      timestampIndex = i;
    }

    if (emailIndex === -1 && /email/i.test(hNorm)) {
      emailIndex = i;
    }

    if (nameIndex === -1 && /(ho\s*ten|full\s*name|\bname\b|ten)/i.test(hNorm) && !/email/i.test(hNorm)) {
      nameIndex = i;
    }

    if (ingameIndex === -1 && /(ingame|in\s*game|ign|nick|ten\s*game)/i.test(hNorm) && !/email/i.test(hNorm)) {
      ingameIndex = i;
    }

    if (rankIndex === -1 && /(rank|hang|tier|elo|mmr)/i.test(hNorm) && !/email/i.test(hNorm)) {
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
    studentStatusIndex: studentStatusIndex
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
    throw new Error('Không tìm thấy cột Email trong responses.');
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

    var name = columns.nameIndex !== -1 ? String(row[columns.nameIndex] || '').trim() : '';
    var ingame = columns.ingameIndex !== -1 ? String(row[columns.ingameIndex] || '').trim() : '';
    var rankRaw = columns.rankIndex !== -1 ? String(row[columns.rankIndex] || '').trim() : '';
    var studentStatusRaw = columns.studentStatusIndex !== -1 ? String(row[columns.studentStatusIndex] || '').trim() : '';

    if (!ingame) {
      ingame = name || email.split('@')[0];
    }
    if (!name) {
      name = ingame;
    }

    var weekStart = getWeekStart_(timestamp);
    requests.push({
      rowNumber: i + 1,
      sourceSheetName: sheet.getName(),
      timestamp: timestamp,
      weekStart: weekStart,
      weekKey: formatDate_(weekStart, 'yyyy-MM-dd'),
      email: email,
      name: name,
      ingame: ingame,
      rankRaw: rankRaw,
      studentStatusRaw: studentStatusRaw,
      headers: headers.slice(),
      rawRow: row.slice()
    });
  }

  return requests;
}

function syncPlayersFromResponses_() {
  var totalScanned = 0;
  var totalSynced = 0;
  var totalFailed = 0;
  var loops = 0;
  var lastResult = null;

  while (loops < 20) {
    loops++;
    lastResult = syncSubmissionsFromResponses_({ batchSize: CONFIG.FORM_SYNC.BATCH_SIZE });
    totalScanned += Number(lastResult.scanned || 0);
    totalSynced += Number(lastResult.synced || 0);
    totalFailed += Number(lastResult.failed || 0);

    if (!Number(lastResult.scanned || 0) || Number(lastResult.scanned || 0) < Number(CONFIG.FORM_SYNC.BATCH_SIZE || 50)) {
      break;
    }
  }

  return {
    totalRequests: totalScanned,
    totalPlayers: totalSynced,
    added: totalSynced,
    failed: totalFailed,
    lastRow: lastResult ? lastResult.lastRow : getLastSyncedFormRow_()
  };
}

function readPlayersRows_() {
  return [];
}

function writePlayersRows_(players) {
  return players || [];
}

function toPlayerMap_(players) {
  var map = {};
  var list = Array.isArray(players) ? players : [];
  for (var i = 0; i < list.length; i++) {
    map[normalizeEmail_(list[i].email)] = list[i];
  }
  return map;
}

function getAvailableWeeks_() {
  var response = apiGet_('/api/weeks', null, { useInternalKey: false });
  return Array.isArray(response.weeks) ? response.weeks : [];
}

function getWeekRequests_(weekKey) {
  var key = String(weekKey || '').trim();
  if (!key) {
    return [];
  }

  var response = apiGet_('/api/submissions', { weekKey: key }, { useInternalKey: false });
  var rows = Array.isArray(response.submissions) ? response.submissions : [];

  return rows.map(function(item) {
    return {
      playerId: item.playerId || null,
      submissionId: item.submissionId || null,
      email: normalizeEmail_(item.email),
      name: item.name || item.ingame || '',
      ingame: item.ingame || item.name || '',
      priority: !!item.priority,
      selectedCount: Number(item.selectedCount || 0),
      requestedAt: String(item.requestedAt || ''),
      requestedAtEpoch: Number(item.requestedAtEpoch || 0),
      rankRaw: item.rankRaw || '',
      rankNormalized: item.rankNormalized || normalizeFixedRank_(item.rankRaw || ''),
      availableDates: Array.isArray(item.availableDates) ? item.availableDates : [],
      studentStatusRaw: item.studentStatusRaw || '',
      paymentRequired: !!item.paymentRequired,
      paymentStatusCode: String(item.paymentStatusCode || 'NONE'),
      paymentStatus: String(item.paymentStatus || '-')
    };
  });
}

function buildPaymentRequirementMap_(weekKey) {
  var map = {};
  var rows = getWeekRequests_(weekKey);
  for (var i = 0; i < rows.length; i++) {
    map[normalizeEmail_(rows[i].email)] = !!rows[i].paymentRequired;
  }
  return map;
}

function buildPaymentInfoFromResponseRequest_(requestRow) {
  if (!requestRow) {
    return null;
  }
  var rawCode = String(requestRow.paymentStatusCodeRaw || requestRow.paymentStatusCode || '').trim();
  var rawLabel = String(requestRow.paymentStatusRaw || requestRow.paymentStatus || '').trim();
  if (!rawCode && !rawLabel) {
    return null;
  }
  var code = String(rawCode || rawLabel).toUpperCase();
  return {
    code: code,
    label: rawLabel || code
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
  return {};
}

function findLatestResponseRowForWeekEmail_(values, columns, email, weekKey) {
  return -1;
}

function syncPaymentStatusToResponses_(requestRow) {
  return { ok: true, reason: 'mongo_source_of_truth' };
}

function syncPaymentStatusToResponsesSafe_(requestRow) {
  return { ok: true, reason: 'mongo_source_of_truth' };
}
