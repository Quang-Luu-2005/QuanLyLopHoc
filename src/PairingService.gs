/**
 * Pairing service
 */

function suggestPairsByRank(payload) {
  payload = payload || {};
  var weekKey = String(payload.weekKey || '').trim();
  if (!weekKey) {
    throw new Error('Ban can chon tuan truoc khi ghep cap.');
  }

  var pairCount = Number(payload.pairCount || 0);
  if (!pairCount || pairCount < 1) {
    throw new Error('So cap can ghep phai lon hon 0.');
  }
  pairCount = Math.floor(pairCount);

  var eventDate = parseDateInput_(payload.eventDate);
  if (!eventDate) {
    throw new Error('Ban can chon ngay thi dau truoc khi ghep cap.');
  }
  if (eventDate.getDay() !== 4 && eventDate.getDay() !== 5) {
    throw new Error('Ngay thi dau chi duoc phep la Thu 5 hoac Thu 6.');
  }

  var requests = getWeekRequests_(weekKey);
  if (!requests.length) {
    return {
      requestedPairs: pairCount,
      actualPairs: 0,
      missingPairs: pairCount,
      pairs: [],
      unpaired: [],
      selectedEmails: [],
      countedEmails: [],
      countAdded: 0,
      countSkipped: 0,
      eventDate: formatDate_(eventDate, 'dd/MM/yyyy'),
      message: 'Tuan nay chua co du lieu dang ky de ghep cap.'
    };
  }

  var groups = {};
  for (var i = 0; i < requests.length; i++) {
    var rankKey = requests[i].rankNormalized || 'Khong ro';
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
  var selectedItems = [];

  for (var c = 0; c < actualPairs; c++) {
    var pair = candidatePairs[c];
    var pairNo = c + 1;

    selectedPairs.push({
      pairNo: pairNo,
      rank: pair.rank,
      a: pair.a,
      b: pair.b
    });

    selectedEmailsMap[pair.a.email] = true;
    selectedEmailsMap[pair.b.email] = true;

    selectedItems.push({
      email: pair.a.email,
      name: pair.a.name,
      ingame: pair.a.ingame,
      rank: pair.rank
    });
    selectedItems.push({
      email: pair.b.email,
      name: pair.b.name,
      ingame: pair.b.ingame,
      rank: pair.rank
    });
  }

  var unpaired = [];
  for (var u = 0; u < requests.length; u++) {
    if (!selectedEmailsMap[requests[u].email]) {
      unpaired.push({
        email: requests[u].email,
        name: requests[u].name,
        ingame: requests[u].ingame,
        rank: requests[u].rankNormalized
      });
    }
  }

  var countResult = countSelections_(weekKey, eventDate, selectedItems, 'PAIR_BY_RANK');
  var missingPairs = Math.max(0, pairCount - actualPairs);
  var eventDateText = formatDate_(eventDate, 'dd/MM/yyyy');

  var message = 'Ghep cap cho ngay ' + eventDateText + ': yeu cau ' + pairCount +
    ' cap, ghep duoc ' + actualPairs + ' cap.';
  if (missingPairs > 0) {
    message += ' Thieu ' + missingPairs + ' cap do khong du nguoi dong rank.';
  }
  message += ' Da cap nhat so lan duoc chon: ' + countResult.added + ' nguoi.';
  if (countResult.skipped > 0) {
    message += ' Bo qua ' + countResult.skipped + ' nguoi vi da duoc tinh truoc do.';
  }

  return {
    requestedPairs: pairCount,
    actualPairs: actualPairs,
    missingPairs: missingPairs,
    eventDate: eventDateText,
    pairs: selectedPairs,
    unpaired: unpaired,
    selectedEmails: Object.keys(selectedEmailsMap),
    countedEmails: countResult.countedEmails,
    countAdded: countResult.added,
    countSkipped: countResult.skipped,
    message: message
  };
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
    email: row.email,
    name: row.name,
    ingame: row.ingame || row.name,
    rank: row.rankNormalized || 'Khong ro'
  };
}
