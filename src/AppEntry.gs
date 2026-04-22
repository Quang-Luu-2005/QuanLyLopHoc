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
      for (var j = 0; j < dates.length; j++) {
        var key = String(dates[j] || '').trim();
        if (!key) {
          continue;
        }
        dateCountMap[key] = Number(dateCountMap[key] || 0) + 1;
      }
    }

    var hasAtLeastOneDate = false;
    eventDateOptions = eventDateOptions.map(function(item) {
      var count = Number(dateCountMap[item.value] || 0);
      if (count > 0) {
        hasAtLeastOneDate = true;
      }
      return {
        value: item.value,
        label: item.label + ' (' + count + ' người khả dụng)'
      };
    });

    if (hasAtLeastOneDate) {
      eventDateOptions = eventDateOptions.filter(function(item) {
        return Number(dateCountMap[item.value] || 0) > 0;
      });
    }
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
