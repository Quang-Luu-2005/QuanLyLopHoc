/**
 * Auto-split module from legacy Code.gs
 */

function getSelectionDedupSet_(eventDate) {
  var eventDateKey = formatDate_(eventDate, 'yyyy-MM-dd');
  var sheet = getOrCreateSheet_(CONFIG.SHEETS.SELECTION_LOG, CONFIG.LOG_HEADERS);
  var dedup = {};

  if (sheet.getLastRow() < 2) {
    return dedup;
  }

  var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, CONFIG.LOG_HEADERS.length).getValues();

  for (var i = 0; i < values.length; i++) {
    var dateValue = toDate_(values[i][1]);
    if (!dateValue) {
      continue;
    }
    if (formatDate_(dateValue, 'yyyy-MM-dd') !== eventDateKey) {
      continue;
    }

    var email = normalizeEmail_(values[i][3]);
    if (!email) {
      continue;
    }

    dedup[eventDateKey + '|' + email] = true;
  }

  return dedup;
}


function getSelectionCountDedupSet_(weekKey, eventDateKey) {
  var sheet = getOrCreateSheet_(CONFIG.SHEETS.SELECTION_COUNT_LOG, CONFIG.SELECTION_COUNT_HEADERS);
  var map = {};

  if (sheet.getLastRow() < 2) {
    return map;
  }

  var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, CONFIG.SELECTION_COUNT_HEADERS.length).getValues();
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][1] || '') !== String(weekKey || '')) {
      continue;
    }
    if (String(values[i][2] || '') !== String(eventDateKey || '')) {
      continue;
    }

    var email = normalizeEmail_(values[i][3]);
    if (email) {
      map[email] = true;
    }
  }

  return map;
}


function countSelections_(weekKey, eventDate, selectedItems, source) {
  selectedItems = Array.isArray(selectedItems) ? selectedItems : [];
  if (!selectedItems.length) {
    return { added: 0, skipped: 0, countedEmails: [] };
  }

  var eventDateKey = formatDate_(eventDate, 'yyyy-MM-dd');
  var dedup = getSelectionCountDedupSet_(weekKey, eventDateKey);
  var sheet = getOrCreateSheet_(CONFIG.SHEETS.SELECTION_COUNT_LOG, CONFIG.SELECTION_COUNT_HEADERS);

  var players = readPlayersRows_();
  var playerMap = toPlayerMap_(players);

  var logRows = [];
  var countedEmails = [];
  var added = 0;
  var skipped = 0;

  for (var i = 0; i < selectedItems.length; i++) {
    var email = normalizeEmail_(selectedItems[i].email);
    if (!email) {
      skipped++;
      continue;
    }

    if (dedup[email]) {
      skipped++;
      continue;
    }

    dedup[email] = true;

    var ingame = String(selectedItems[i].ingame || selectedItems[i].name || '').trim();
    var name = String(selectedItems[i].name || selectedItems[i].ingame || '').trim();
    if (!name) {
      name = email.split('@')[0];
    }
    if (!ingame) {
      ingame = name;
    }

    var rank = normalizeFixedRank_(selectedItems[i].rank || '');

    var player = playerMap[email];
    if (!player) {
      player = {
        email: email,
        name: ingame || name,
        priority: false,
        selectedCount: 0,
        lastSelectedDate: '',
        lastRequestAt: ''
      };
      players.push(player);
      playerMap[email] = player;
    }

    if (ingame) {
      player.name = ingame;
    } else if (name) {
      player.name = name;
    }

    player.selectedCount = Number(player.selectedCount || 0) + 1;
    player.lastSelectedDate = eventDate;

    logRows.push([
      new Date(),
      String(weekKey || ''),
      eventDateKey,
      email,
      name,
      ingame,
      rank,
      String(source || 'MANUAL')
    ]);

    countedEmails.push(email);
    added++;
  }

  if (logRows.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, logRows.length, CONFIG.SELECTION_COUNT_HEADERS.length)
      .setValues(logRows);
  }

  if (added > 0) {
    writePlayersRows_(players);
  }

  return {
    added: added,
    skipped: skipped,
    countedEmails: countedEmails
  };
}


