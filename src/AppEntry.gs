/**
 * Điểm vào ứng dụng (ưu tiên MongoDB).
 */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('GatherEasy')
    .addItem('Mở dashboard chọn người', 'showDashboard')
    .addItem('Khởi tạo hệ thống', 'initializeGatherEasy')
    .addItem('Đồng bộ danh sách người chơi', 'syncPlayersManual')
    .addItem('Cài trigger onFormSubmit', 'installTriggers')
    .addItem('Kiểm tra webhook PayOS', 'processPaidPaymentRequests')
    .addItem('Kiểm tra collect email của Form', 'checkFormEmailSetup')
    .addToUi();
}

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Template').setTitle('GatherEasy');
}

function showDashboard() {
  var html = HtmlService.createHtmlOutputFromFile('Template')
    .setTitle('GatherEasy')
    .setWidth(460);
  SpreadsheetApp.getUi().showSidebar(html);
}

function initializeGatherEasy() {
  var destinationStatus = ensureFormDestination_();
  var formStatus = enforceFormEmailCollection_();
  var syncResult = syncPlayersFromResponses_();
  installTriggers();

  var message = [
    'Khởi tạo xong.',
    'Đồng bộ form: ' + Number(syncResult.totalRequests || 0) + ' dòng quét, ' + Number(syncResult.added || 0) + ' dòng đồng bộ.',
    destinationStatus.message,
    formStatus.message
  ].join(' ');

  notifyUser_(message, 'GatherEasy', 8);
  return {
    destinationStatus: destinationStatus,
    formStatus: formStatus,
    syncResult: syncResult
  };
}

function syncPlayersManual() {
  var result = syncPlayersFromResponses_();
  notifyUser_(
    'Đồng bộ xong. Đã quét: ' + Number(result.totalRequests || 0) + ', Đã đồng bộ: ' + Number(result.added || 0) + '.',
    'GatherEasy',
    6
  );
  return result;
}

function checkFormEmailSetup() {
  var status = enforceFormEmailCollection_();
  SpreadsheetApp.getUi().alert('GatherEasy', status.message, SpreadsheetApp.getUi().ButtonSet.OK);
  return status;
}

function installTriggers() {
  var ss = getTargetSpreadsheet_();
  var triggers = ScriptApp.getProjectTriggers();

  for (var i = 0; i < triggers.length; i++) {
    var handler = triggers[i].getHandlerFunction();
    if (handler === 'onFormSubmit' || handler === 'processPaidPaymentMailsFromApi_') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  ScriptApp.newTrigger('onFormSubmit').forSpreadsheet(ss).onFormSubmit().create();
  // Mail thứ 2 gửi trực tiếp qua doPost (webhook PayOS), không còn polling từ backend.
  return { ok: true };
}

function onFormSubmit(e) {
  return syncSubmissionsFromResponses_({ batchSize: CONFIG.FORM_SYNC.BATCH_SIZE });
}

function processPaidPaymentMailsFromApi_() {
  Logger.log('processPaidPaymentMailsFromApi_: đã tắt. Mail thứ 2 được gửi trực tiếp từ doPost webhook PayOS.');
  return {
    processed: 0,
    sent: 0,
    errors: 0,
    skipped: true,
    reason: 'disabled_use_webhook_dopost'
  };
}

function getEventDayTokenFromValue_(value) {
  var parsed = parseDateInput_(value);
  if (parsed) {
    var day = parsed.getDay();
    if (day === 4) {
      return 'THU5';
    }
    if (day === 5) {
      return 'THU6';
    }
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

function getDashboardData(weekKey) {
  syncPlayersFromResponses_();

  var weeks = getAvailableWeeks_();
  var activeWeek = weekKey || (weeks.length ? weeks[0].key : '');
  var requests = activeWeek ? getWeekRequests_(activeWeek) : [];
  var eventDateOptions = buildEventDateOptions_(activeWeek);
  if (eventDateOptions.length && requests.length) {
    var dateCountMap = {};
    for (var i = 0; i < requests.length; i++) {
      var dates = Array.isArray(requests[i].availableDates) ? requests[i].availableDates : [];
      var rowTokenMap = {};
      for (var j = 0; j < dates.length; j++) {
        var token = getEventDayTokenFromValue_(dates[j]);
        if (!token || rowTokenMap[token]) {
          continue;
        }
        rowTokenMap[token] = true;
        dateCountMap[token] = Number(dateCountMap[token] || 0) + 1;
      }
    }

    var hasAtLeastOneDate = false;
    eventDateOptions = eventDateOptions.map(function(item) {
      var optionToken = getEventDayTokenFromValue_(item.value);
      var count = Number(dateCountMap[optionToken] || 0);
      if (count > 0) {
        hasAtLeastOneDate = true;
      }
      return {
        value: item.value,
        label: item.label + ' (' + count + ' người khả dụng)'
      };
    });

    // Giữ đủ 2 lựa chọn Thứ 5/Thứ 6 để người dùng tự quyết định lịch gửi mail.
  }

  return {
    weeks: weeks,
    activeWeek: activeWeek,
    requests: requests,
    eventDateOptions: eventDateOptions,
    defaultEventDate: eventDateOptions.length ? eventDateOptions[0].value : '',
    rankLevels: CONFIG.RANK_LEVELS.slice(),
    defaultSubject: CONFIG.DEFAULT_SUBJECT,
    defaultMessage: CONFIG.DEFAULT_MESSAGE
  };
}

function getWeekRequests(weekKey) {
  return getWeekRequests_(weekKey);
}
