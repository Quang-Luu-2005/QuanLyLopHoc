/**
 * Auto-split module from legacy Code.gs
 */

function suggestPairsByRank(payload) {
  ensureSupportSheets_();
  syncPlayersFromResponses_();

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
      message: 'Tuần này chưa có dữ liệu đăng ký để ghép cặp.'
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

  var message = 'Ghép cặp cho ngày ' + eventDateText + ': yêu cầu ' + pairCount +
    ' cặp, ghép được ' + actualPairs + ' cặp.';
  if (missingPairs > 0) {
    message += ' Thiếu ' + missingPairs + ' cặp do không đủ người đồng rank.';
  }
  message += ' Đã cập nhật số lần được chọn: ' + countResult.added + ' người.';
  if (countResult.skipped > 0) {
    message += ' Bỏ qua ' + countResult.skipped + ' người vì đã được tính trước đó.';
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
    rank: row.rankNormalized || 'Không rõ'
  };
}


