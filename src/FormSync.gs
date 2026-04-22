function isStudentFromRaw_(studentStatusRaw) {
  var text = normalizeSearchText_(studentStatusRaw);
  if (!text) {
    return false;
  }
  return text.indexOf('khong') === -1;
}

function extractAvailableDatesFromRequest_(requestRow) {
  if (!requestRow) {
    return [];
  }

  if (Array.isArray(requestRow.availableDates)) {
    return requestRow.availableDates;
  }

  var out = [];
  var seen = {};
  // Dùng ngày mốc cố định để biểu diễn "Thứ 5/Thứ 6":
  // - 1970-01-01 = Thursday
  // - 1970-01-02 = Friday
  // Không phụ thuộc tuần đăng ký.
  var THU5_REF_DATE = '1970-01-01';
  var THU6_REF_DATE = '1970-01-02';

  function pushDateKey(dateKey) {
    var key = String(dateKey || '').trim();
    if (!key || seen[key]) {
      return;
    }
    seen[key] = true;
    out.push(key);
  }

  function addWeekdayTokens(value) {
    var normalized = normalizeSearchText_(value);
    if (!normalized) {
      return;
    }

    var hasThu5 =
      normalized.indexOf('thu 5') !== -1 ||
      normalized.indexOf('thu5') !== -1 ||
      normalized.indexOf('thu nam') !== -1 ||
      normalized.indexOf('thunam') !== -1;
    var hasThu6 =
      normalized.indexOf('thu 6') !== -1 ||
      normalized.indexOf('thu6') !== -1 ||
      normalized.indexOf('thu sau') !== -1 ||
      normalized.indexOf('thusau') !== -1;

    if (hasThu5) {
      pushDateKey(THU5_REF_DATE);
    }
    if (hasThu6) {
      pushDateKey(THU6_REF_DATE);
    }
  }

  function addDateByText(text) {
    var value = String(text || '').trim();
    if (!value) {
      return;
    }

    var ymd = value.match(/(20\d{2})-(\d{2})-(\d{2})/);
    if (ymd) {
      pushDateKey(ymd[1] + '-' + ymd[2] + '-' + ymd[3]);
      return;
    }

    var dmy = value.match(/(\d{2})\/(\d{2})\/(20\d{2})/);
    if (dmy) {
      pushDateKey(dmy[3] + '-' + dmy[2] + '-' + dmy[1]);
      return;
    }

    addWeekdayTokens(value);
  }

  var headers = Array.isArray(requestRow.headers) ? requestRow.headers : [];
  var row = Array.isArray(requestRow.rawRow) ? requestRow.rawRow : [];

  for (var i = 0; i < row.length; i++) {
    var raw = row[i];
    var cellText = String(raw || '').trim();
    if (!cellText) {
      continue;
    }

    addDateByText(cellText);

    if (cellText.indexOf(',') !== -1) {
      var parts = cellText.split(',');
      for (var p = 0; p < parts.length; p++) {
        addDateByText(parts[p]);
      }
    }

    var header = String(headers[i] || '').trim();
    var selected = toBoolean_(raw) || /^(x|yes|co)$/i.test(cellText);
    if (selected && header) {
      addDateByText(header);
    }
  }

  return out;
}

function buildSubmissionPayloadFromRequest_(requestRow) {
  return {
    email: requestRow.email,
    ingameName: requestRow.ingame || requestRow.name || requestRow.email,
    zaloPhone: requestRow.zaloPhone || '',
    isStudent: isStudentFromRaw_(requestRow.studentStatusRaw),
    highestRank: requestRow.rankRaw || '',
    submittedAt: requestRow.timestamp ? new Date(requestRow.timestamp).toISOString() : new Date().toISOString(),
    sourceSheetRow: requestRow.rowNumber || null,
    sourceSheetName: requestRow.sourceSheetName || '',
    availableDates: extractAvailableDatesFromRequest_(requestRow)
  };
}

function getLastSyncedFormRow_() {
  var prop = PropertiesService.getScriptProperties().getProperty(CONFIG.FORM_SYNC.PROPERTY_LAST_ROW);
  var n = Number(prop || 0);
  if (!n || n < 0) {
    return 0;
  }
  return Math.floor(n);
}

function setLastSyncedFormRow_(rowNumber) {
  var n = Number(rowNumber || 0);
  if (!n || n < 0) {
    n = 0;
  }
  PropertiesService.getScriptProperties().setProperty(CONFIG.FORM_SYNC.PROPERTY_LAST_ROW, String(Math.floor(n)));
}

function getLastSyncedFormSnapshot_() {
  var key = CONFIG.FORM_SYNC && CONFIG.FORM_SYNC.PROPERTY_LAST_SNAPSHOT;
  if (!key) {
    return '';
  }
  return String(PropertiesService.getScriptProperties().getProperty(key) || '').trim();
}

function setLastSyncedFormSnapshot_(signature) {
  var key = CONFIG.FORM_SYNC && CONFIG.FORM_SYNC.PROPERTY_LAST_SNAPSHOT;
  if (!key) {
    return;
  }
  PropertiesService.getScriptProperties().setProperty(key, String(signature || '').trim());
}

function bytesToHex_(bytes) {
  var out = '';
  var list = Array.isArray(bytes) ? bytes : [];
  for (var i = 0; i < list.length; i++) {
    var value = list[i];
    if (value < 0) {
      value += 256;
    }
    var hex = value.toString(16);
    if (hex.length < 2) {
      hex = '0' + hex;
    }
    out += hex;
  }
  return out;
}

function getResponsesSheetSnapshot_() {
  var sheet = getResponsesSheet_();
  var lastRow = Number(sheet.getLastRow() || 0);
  var lastCol = Number(sheet.getLastColumn() || 0);

  if (lastRow < 1 || lastCol < 1) {
    return {
      signature: 'EMPTY|R0|C0',
      lastRow: lastRow,
      lastCol: lastCol
    };
  }

  var values = sheet.getRange(1, 1, lastRow, lastCol).getDisplayValues();
  var lines = [];
  for (var r = 0; r < values.length; r++) {
    var row = values[r];
    var cells = [];
    for (var c = 0; c < row.length; c++) {
      cells.push(String(row[c] === null || row[c] === undefined ? '' : row[c]).trim());
    }
    lines.push(cells.join('\u001f'));
  }

  var payload = lines.join('\u001e');
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, payload, Utilities.Charset.UTF_8);
  var hash = bytesToHex_(digest);

  return {
    signature: 'MD5:' + hash + '|R' + lastRow + '|C' + lastCol,
    lastRow: lastRow,
    lastCol: lastCol
  };
}

function syncSubmissionsFromResponses_(options) {
  options = options || {};

  var all = getAllRequests_();
  if (!all.length) {
    return {
      scanned: 0,
      synced: 0,
      failed: 0,
      lastRow: getLastSyncedFormRow_()
    };
  }

  var forceFull = !!options.forceFull;
  var lastRow = forceFull ? 0 : getLastSyncedFormRow_();
  var pending = [];

  for (var i = 0; i < all.length; i++) {
    if (Number(all[i].rowNumber || 0) > lastRow) {
      pending.push(all[i]);
    }
  }

  if (!pending.length) {
    return {
      scanned: 0,
      synced: 0,
      failed: 0,
      lastRow: lastRow
    };
  }

  var batchSize = Number(options.batchSize || CONFIG.FORM_SYNC.BATCH_SIZE || 50);
  if (!batchSize || batchSize < 1) {
    batchSize = 50;
  }

  var chunk = pending.slice(0, batchSize);
  var payloadItems = [];
  for (var j = 0; j < chunk.length; j++) {
    payloadItems.push(buildSubmissionPayloadFromRequest_(chunk[j]));
  }

  var result = apiPost_('/internal/sync-submissions-batch', {
    items: payloadItems
  });

  var results = Array.isArray(result.results) ? result.results : [];
  var firstFailedIndex = -1;
  var syncedCount = 0;

  for (var k = 0; k < results.length; k++) {
    if (results[k] && results[k].ok) {
      syncedCount++;
      continue;
    }
    firstFailedIndex = k;
    break;
  }

  if (firstFailedIndex === -1) {
    setLastSyncedFormRow_(chunk[chunk.length - 1].rowNumber);
  } else if (firstFailedIndex > 0) {
    setLastSyncedFormRow_(chunk[firstFailedIndex - 1].rowNumber);
  }

  return {
    scanned: chunk.length,
    synced: syncedCount,
    failed: Number(result.failed || 0),
    success: Number(result.success || syncedCount),
    total: Number(result.total || chunk.length),
    lastRow: getLastSyncedFormRow_()
  };
}

function forceResyncAllSubmissions() {
  setLastSyncedFormRow_(0);
  return syncSubmissionsFromResponses_({
    forceFull: true,
    batchSize: 500
  });
}
