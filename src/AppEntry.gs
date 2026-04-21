/**
 * Auto-split module from legacy Code.gs
 */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('GatherEasy')
    .addItem('Mở dashboard chọn người', 'showDashboard')
    .addItem('Khởi tạo hệ thống', 'initializeGatherEasy')
    .addItem('Đồng bộ danh sách người chơi', 'syncPlayersManual')
    .addItem('Cài trigger onFormSubmit', 'installTriggers')
    .addItem('Xử lý thanh toán chờ', 'processPaidPaymentRequests')
    .addItem('Kiểm tra collect email của Form', 'checkFormEmailSetup')
    .addToUi();
}


function doGet() {
  return HtmlService.createHtmlOutputFromFile('Template').setTitle('GatherEasy');
}


function showDashboard() {
  ensureSupportSheets_();
  var html = HtmlService.createHtmlOutputFromFile('Template')
    .setTitle('GatherEasy')
    .setWidth(460);
  SpreadsheetApp.getUi().showSidebar(html);
}


function initializeGatherEasy() {
  ensureSupportSheets_();
  var destinationStatus = ensureFormDestination_();
  var formStatus = enforceFormEmailCollection_();
  var syncResult = syncPlayersFromResponses_();
  installTriggers();

  var message = [
    'Khởi tạo xong.',
    'Tổng người chơi: ' + syncResult.totalPlayers,
    'Mới thêm: ' + syncResult.added,
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
  ensureSupportSheets_();
  var result = syncPlayersFromResponses_();
  notifyUser_(
    'Đồng bộ xong. Tổng người chơi: ' + result.totalPlayers + ', Mới thêm: ' + result.added,
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
    if (handler === 'onFormSubmit' || handler === 'processPaidPaymentRequests') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  ScriptApp.newTrigger('onFormSubmit').forSpreadsheet(ss).onFormSubmit().create();
  ScriptApp.newTrigger('processPaidPaymentRequests').timeBased().everyMinutes(5).create();
  return { ok: true };
}


function onFormSubmit() {
  ensureSupportSheets_();
  syncPlayersFromResponses_();
}


function getDashboardData(weekKey) {
  ensureSupportSheets_();
  syncPlayersFromResponses_();
  try {
    processPaidPaymentRequests();
  } catch (err) {
    Logger.log('processPaidPaymentRequests failed in getDashboardData: ' + String(err && err.message ? err.message : err));
  }

  var weeks = getAvailableWeeks_();
  var activeWeek = weekKey || (weeks.length ? weeks[0].key : '');
  var requests = activeWeek ? getWeekRequests_(activeWeek) : [];
  var eventDateOptions = buildEventDateOptions_(activeWeek);

  return {
    weeks: weeks,
    activeWeek: activeWeek,
    requests: requests,
    eventDateOptions: eventDateOptions,
    defaultEventDate: eventDateOptions.length ? eventDateOptions[0].value : '',
    defaultSubject: CONFIG.DEFAULT_SUBJECT,
    defaultMessage: CONFIG.DEFAULT_MESSAGE
  };
}


function getWeekRequests(weekKey) {
  ensureSupportSheets_();
  syncPlayersFromResponses_();
  try {
    processPaidPaymentRequests();
  } catch (err) {
    Logger.log('processPaidPaymentRequests failed in getWeekRequests: ' + String(err && err.message ? err.message : err));
  }
  return getWeekRequests_(weekKey);
}

