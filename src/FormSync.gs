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

  function addDateByText(text) {
    var value = String(text || '').trim();
    if (!value) {
      return;
    }

    var ymd = value.match(/(20\d{2})-(\d{2})-(\d{2})/);
    if (ymd) {
      var ymdKey = ymd[1] + '-' + ymd[2] + '-' + ymd[3];
      if (!seen[ymdKey]) {
        seen[ymdKey] = true;
        out.push(ymdKey);
      }
      return;
    }

    var dmy = value.match(/(\d{2})\/(\d{2})\/(20\d{2})/);
    if (dmy) {
      var dmyKey = dmy[3] + '-' + dmy[2] + '-' + dmy[1];
      if (!seen[dmyKey]) {
        seen[dmyKey] = true;
        out.push(dmyKey);
      }
    }
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
