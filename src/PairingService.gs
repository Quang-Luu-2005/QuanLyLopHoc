/**
 * Dịch vụ ghép cặp.
 */

function suggestPairsByRank(payload) {
  payload = payload || {};
  var weekKey = String(payload.weekKey || '').trim();
  if (!weekKey) {
    throw new Error('Bạn cần chọn tuần trước khi ghép cặp.');
  }

  var pairCount = Number(payload.pairCount || 0);
  if (!pairCount || pairCount < 1) {
    throw new Error('Số cặp cần ghép phải lớn hơn 0.');
  }
  pairCount = Math.floor(pairCount);

  var eventDate = parseDateInput_(payload.eventDate);
  if (!eventDate) {
    throw new Error('Bạn cần chọn ngày thi đấu trước khi ghép cặp.');
  }
  if (eventDate.getDay() !== 4 && eventDate.getDay() !== 5) {
    throw new Error('Ngày thi đấu chỉ được phép là Thứ 5 hoặc Thứ 6.');
  }
  var eventDateKey = formatDate_(eventDate, 'yyyy-MM-dd');
  var eventDayToken = getPairingEventDayTokenFromDate_(eventDate);

  var requests = Array.isArray(payload.items) ? payload.items : getWeekRequests_(weekKey);
  requests = requests.map(function(item) {
    var rankNormalized = item.rankNormalized || normalizeFixedRank_(item.rankRaw || item.rank || '');
    return {
      playerId: item.playerId || null,
      submissionId: item.submissionId || null,
      email: normalizeEmail_(item.email),
      name: item.name || item.ingame || '',
      ingame: item.ingame || item.name || '',
      rankRaw: item.rankRaw || item.rank || '',
      rankNormalized: rankNormalized || 'Không rõ',
      priority: !!item.priority,
      selectedCount: Number(item.selectedCount || 0),
      requestedAtEpoch: Number(item.requestedAtEpoch || 0),
      paymentRequired: !!item.paymentRequired,
      availableDates: Array.isArray(item.availableDates) ? item.availableDates : []
    };
  });
  requests = requests.filter(function(item) {
    if (!item.email) {
      return false;
    }
    if (!item.availableDates.length) {
      return false;
    }
    return hasPairingAvailableDateForEvent_(item.availableDates, eventDayToken);
  });

  if (!requests.length) {
    return {
      requestedPairs: pairCount,
      actualPairs: 0,
      missingPairs: pairCount,
      pairs: [],
      selectedEmails: [],
      weekKey: weekKey,
      eventDateKey: eventDateKey,
      eventDate: formatDate_(eventDate, 'dd/MM/yyyy'),
      message: 'Không có người đăng ký khả dụng cho ngày thi đấu đã chọn.'
    };
  }

  var groups = {};
  for (var i = 0; i < requests.length; i++) {
    var rankKey = requests[i].rankNormalized || 'Không rõ';
    if (!groups[rankKey]) {
      groups[rankKey] = [];
    }
    groups[rankKey].push(requests[i]);
  }

  var rankKeys = Object.keys(groups);
  var candidatePairs = [];

  for (var r = 0; r < rankKeys.length; r++) {
    var rank = rankKeys[r];
    var group = groups[rank];
    group.sort(sortRequestsForPair_);

    for (var p = 0; p + 1 < group.length; p += 2) {
      var a = group[p];
      var b = group[p + 1];
      candidatePairs.push({
        rank: rank,
        rankOrder: getRankOrder_(rank),
        a: toPairPlayer_(a),
        b: toPairPlayer_(b),
        priorityScore: Number(!!a.priority) + Number(!!b.priority),
        selectedScore: Number(a.selectedCount || 0) + Number(b.selectedCount || 0),
        requestScore: Math.min(Number(a.requestedAtEpoch || 0), Number(b.requestedAtEpoch || 0))
      });
    }
  }

  candidatePairs.sort(function(a, b) {
    if (b.priorityScore !== a.priorityScore) {
      return b.priorityScore - a.priorityScore;
    }
    if (a.selectedScore !== b.selectedScore) {
      return a.selectedScore - b.selectedScore;
    }
    if (a.rankOrder !== b.rankOrder) {
      return a.rankOrder - b.rankOrder;
    }
    return a.requestScore - b.requestScore;
  });

  var actualPairs = Math.min(pairCount, candidatePairs.length);
  var selectedPairs = [];
  var selectedEmailsMap = {};

  for (var c = 0; c < actualPairs; c++) {
    var pair = candidatePairs[c];
    var pairNo = c + 1;
    var pairId = buildPairId_(pair.a, pair.b, pairNo);

    selectedPairs.push({
      pairId: pairId,
      pairNo: pairNo,
      rank: pair.rank,
      a: pair.a,
      b: pair.b
    });

    selectedEmailsMap[pair.a.email] = true;
    selectedEmailsMap[pair.b.email] = true;
  }

  var missingPairs = Math.max(0, pairCount - actualPairs);
  var eventDateText = formatDate_(eventDate, 'dd/MM/yyyy');

  var message = 'Ghép cặp cho ngày ' + eventDateText + ': yêu cầu ' + pairCount +
    ' cặp, ghép được ' + actualPairs + ' cặp.';
  if (missingPairs > 0) {
    message += ' Thiếu ' + missingPairs + ' cặp do không đủ người đồng rank.';
  }

  return {
    weekKey: weekKey,
    eventDateKey: eventDateKey,
    requestedPairs: pairCount,
    actualPairs: actualPairs,
    missingPairs: missingPairs,
    eventDate: eventDateText,
    pairs: selectedPairs,
    selectedEmails: Object.keys(selectedEmailsMap),
    message: message
  };
}

function buildPairId_(a, b, pairNo) {
  var emailA = normalizeEmail_(a && a.email);
  var emailB = normalizeEmail_(b && b.email);
  var sorted = [emailA, emailB].sort();
  return sorted[0] + '__' + sorted[1] + '__' + String(pairNo || 0);
}

function getPairingEventDayTokenFromDate_(dateObj) {
  if (!dateObj || isNaN(dateObj.getTime())) {
    return '';
  }
  if (dateObj.getDay() === 4) {
    return 'THU5';
  }
  if (dateObj.getDay() === 5) {
    return 'THU6';
  }
  return '';
}

function getPairingEventDayTokenFromValue_(value) {
  var parsed = parseDateInput_(value);
  if (parsed) {
    return getPairingEventDayTokenFromDate_(parsed);
  }

  var normalized = normalizeSearchText_(value);
  if (!normalized) {
    return '';
  }

  if (
    normalized.indexOf('thu 5') !== -1 ||
    normalized.indexOf('thu5') !== -1 ||
    normalized.indexOf('thu nam') !== -1 ||
    normalized.indexOf('thunam') !== -1
  ) {
    return 'THU5';
  }
  if (
    normalized.indexOf('thu 6') !== -1 ||
    normalized.indexOf('thu6') !== -1 ||
    normalized.indexOf('thu sau') !== -1 ||
    normalized.indexOf('thusau') !== -1
  ) {
    return 'THU6';
  }
  return '';
}

function hasPairingAvailableDateForEvent_(availableDates, eventDayToken) {
  var list = Array.isArray(availableDates) ? availableDates : [];
  for (var i = 0; i < list.length; i++) {
    var value = String(list[i] || '').trim();
    if (!value) {
      continue;
    }
    if (getPairingEventDayTokenFromValue_(value) === eventDayToken) {
      return true;
    }
  }
  return false;
}

function getRankOrder_(rankLabel) {
  for (var i = 0; i < CONFIG.RANK_LEVELS.length; i++) {
    if (CONFIG.RANK_LEVELS[i] === rankLabel) {
      return i;
    }
  }
  return CONFIG.RANK_LEVELS.length + 1;
}

function sortRequestsForPair_(a, b) {
  if (Number(!!b.priority) !== Number(!!a.priority)) {
    return Number(!!b.priority) - Number(!!a.priority);
  }
  if (Number(a.selectedCount || 0) !== Number(b.selectedCount || 0)) {
    return Number(a.selectedCount || 0) - Number(b.selectedCount || 0);
  }
  if (Number(a.requestedAtEpoch || 0) !== Number(b.requestedAtEpoch || 0)) {
    return Number(a.requestedAtEpoch || 0) - Number(b.requestedAtEpoch || 0);
  }
  return String(a.ingame || a.name || a.email).localeCompare(String(b.ingame || b.name || b.email));
}

function toPairPlayer_(row) {
  return {
    playerId: row.playerId || null,
    submissionId: row.submissionId || null,
    email: row.email,
    name: row.name,
    ingame: row.ingame || row.name,
    rank: row.rankNormalized || 'Không rõ',
    paymentRequired: !!row.paymentRequired,
    priority: !!row.priority
  };
}

function normalizePairingPayload_(payload) {
  var weekKey = String(payload && payload.weekKey || '').trim();
  var eventDate = parseDateInput_(payload && payload.eventDate);
  if (!weekKey || !eventDate) {
    throw new Error('Thiếu tuần hoặc ngày thi đấu để lưu ghép cặp.');
  }
  if (eventDate.getDay() !== 4 && eventDate.getDay() !== 5) {
    throw new Error('Ngày thi đấu chỉ được phép là Thứ 5 hoặc Thứ 6.');
  }

  var pairRows = Array.isArray(payload && payload.pairs) ? payload.pairs : [];
  var normalizedPairs = [];
  for (var i = 0; i < pairRows.length; i++) {
    var pair = pairRows[i] || {};
    var a = pair.a || {};
    var b = pair.b || {};
    if (!normalizeEmail_(a.email) || !normalizeEmail_(b.email)) {
      continue;
    }
    var pairNo = Number(pair.pairNo || 0);
    normalizedPairs.push({
      pairId: String(pair.pairId || buildPairId_(a, b, pairNo || (i + 1))),
      pairNo: pairNo || (i + 1),
      rank: String(pair.rank || a.rank || b.rank || 'Không rõ'),
      a: {
        playerId: a.playerId || null,
        submissionId: a.submissionId || null,
        email: normalizeEmail_(a.email),
        name: a.name || a.ingame || '',
        ingame: a.ingame || a.name || '',
        rank: String(pair.rank || a.rank || 'Không rõ'),
        paymentRequired: !!a.paymentRequired,
        priority: !!a.priority
      },
      b: {
        playerId: b.playerId || null,
        submissionId: b.submissionId || null,
        email: normalizeEmail_(b.email),
        name: b.name || b.ingame || '',
        ingame: b.ingame || b.name || '',
        rank: String(pair.rank || b.rank || 'Không rõ'),
        paymentRequired: !!b.paymentRequired,
        priority: !!b.priority
      }
    });
  }

  return {
    weekKey: weekKey,
    eventDate: formatDate_(eventDate, 'yyyy-MM-dd'),
    eventDateText: formatDate_(eventDate, 'dd/MM/yyyy'),
    pairs: normalizedPairs
  };
}

function normalizePairingResponse_(pairing) {
  var plan = pairing || {};
  var pairs = Array.isArray(plan.pairs) ? plan.pairs : [];
  return {
    weekKey: String(plan.weekKey || ''),
    eventDate: String(plan.eventDate || ''),
    status: String(plan.status || 'DRAFT'),
    pairCount: Number(plan.pairCount || pairs.length || 0),
    pairs: pairs,
    selectedEmails: Array.isArray(plan.selectedEmails) ? plan.selectedEmails : [],
    sentAt: plan.sentAt || null,
    updatedAt: plan.updatedAt || null
  };
}

function getSavedPairingPlan(payload) {
  payload = payload || {};
  var weekKey = String(payload.weekKey || '').trim();
  var eventDate = parseDateInput_(payload.eventDate);
  if (!weekKey || !eventDate) {
    throw new Error('Thiếu tuần hoặc ngày thi đấu để xem cặp đã ghép.');
  }

  var result = apiGet_('/internal/pairing-plan', {
    weekKey: weekKey,
    eventDate: formatDate_(eventDate, 'yyyy-MM-dd')
  });

  return normalizePairingResponse_(result.pairing);
}

function savePairingDraft(payload) {
  var data = normalizePairingPayload_(payload);
  var result = apiPost_('/internal/save-pairing-plan', {
    weekKey: data.weekKey,
    eventDate: data.eventDate,
    status: 'DRAFT',
    pairs: data.pairs
  });
  var response = normalizePairingResponse_(result.pairing);
  response.message = 'Đã lưu ' + response.pairCount + ' cặp ở trạng thái xem xét.';
  return response;
}

function deletePairFromSavedPlan(payload) {
  payload = payload || {};
  var weekKey = String(payload.weekKey || '').trim();
  var eventDate = parseDateInput_(payload.eventDate);
  var pairId = String(payload.pairId || '').trim();
  if (!weekKey || !eventDate || !pairId) {
    throw new Error('Thiếu thông tin để xóa cặp đã ghép.');
  }

  var result = apiPost_('/internal/delete-pair-from-plan', {
    weekKey: weekKey,
    eventDate: formatDate_(eventDate, 'yyyy-MM-dd'),
    pairId: pairId
  });
  var response = normalizePairingResponse_(result.pairing);
  response.message = 'Đã xóa cặp đấu. Còn lại ' + response.pairCount + ' cặp.';
  return response;
}

function sendPairingNow(payload) {
  payload = payload || {};
  var data = normalizePairingPayload_(payload);
  if (!data.pairs.length) {
    throw new Error('Không có cặp nào để gửi mail.');
  }

  // Lưu trước ở trạng thái xem xét để tránh mất dữ liệu nếu bước gửi mail lỗi.
  apiPost_('/internal/save-pairing-plan', {
    weekKey: data.weekKey,
    eventDate: data.eventDate,
    status: 'DRAFT',
    pairs: data.pairs
  });

  var selected = [];
  for (var i = 0; i < data.pairs.length; i++) {
    var pair = data.pairs[i];
    selected.push(pair.a);
    selected.push(pair.b);
  }

  var mailResult = sendSelectionEmails({
    weekKey: data.weekKey,
    eventDate: data.eventDate,
    zaloLink: payload.zaloLink,
    subject: payload.subject,
    message: payload.message,
    selected: selected
  });

  var savedSent = apiPost_('/internal/save-pairing-plan', {
    weekKey: data.weekKey,
    eventDate: data.eventDate,
    status: 'SENT',
    pairs: data.pairs
  });

  return {
    pairing: normalizePairingResponse_(savedSent.pairing),
    mail: mailResult
  };
}

function removeWeekRegistration(payload) {
  payload = payload || {};
  var weekKey = String(payload.weekKey || '').trim();
  var email = normalizeEmail_(payload.email);
  if (!weekKey || !email) {
    throw new Error('Thiếu tuần hoặc email để xóa đăng ký.');
  }

  return apiPost_('/internal/remove-week-registration', {
    weekKey: weekKey,
    email: email
  });
}
