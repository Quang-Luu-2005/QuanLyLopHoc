/**
 * App entry (PostgreSQL-first).
 */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('GatherEasy')
    .addItem('Mo dashboard chon nguoi', 'showDashboard')
    .addItem('Khoi tao he thong', 'initializeGatherEasy')
    .addItem('Dong bo form -> PostgreSQL', 'syncPlayersManual')
    .addItem('Cai trigger onFormSubmit', 'installTriggers')
    .addItem('Xu ly gui link nhom sau thanh toan', 'processPaidPaymentMailsFromApi_')
    .addItem('Kiem tra collect email cua Form', 'checkFormEmailSetup')
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
    'Khoi tao xong.',
    'Dong bo form: ' + Number(syncResult.totalRequests || 0) + ' dong scan, ' + Number(syncResult.added || 0) + ' dong synced.',
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
    'Dong bo xong. Scanned: ' + Number(result.totalRequests || 0) + ', Synced: ' + Number(result.added || 0) + '.',
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
  ScriptApp.newTrigger('processPaidPaymentMailsFromApi_').timeBased().everyMinutes(5).create();
  return { ok: true };
}

function onFormSubmit(e) {
  return syncSubmissionsFromResponses_({ batchSize: CONFIG.FORM_SYNC.BATCH_SIZE });
}

function processPaidPaymentMailsFromApi_() {
  var cooldown = Number((CONFIG.PAYMENT && CONFIG.PAYMENT.GROUP_MAIL_COOLDOWN_MINUTES) || 2);
  var ready = apiGet_('/internal/ready-group-mails', { cooldownMinutes: cooldown });
  var rows = Array.isArray(ready.rows) ? ready.rows : [];

  var sent = 0;
  var errors = 0;

  for (var i = 0; i < rows.length; i++) {
    var item = rows[i] || {};
    var email = normalizeEmail_(item.email);
    var paymentId = Number(item.paymentId || item.id || 0);
    if (!email || !paymentId) {
      continue;
    }

    try {
      var eventDate = item.eventDate ? parseDateInput_(item.eventDate) : null;
      var eventDateText = eventDate ? formatDate_(eventDate, 'dd/MM/yyyy') : 'sap toi';
      var htmlBody = buildSelectionEmailHtml_(
        item.ingameName || email,
        eventDateText,
        String(item.groupLink || '').trim(),
        String(item.supportMessage || CONFIG.DEFAULT_MESSAGE || '').trim(),
        false
      );

      MailApp.sendEmail({
        to: email,
        subject: CONFIG.DEFAULT_SUBJECT.replace('{{eventDate}}', eventDateText),
        htmlBody: htmlBody,
        name: CONFIG.MAIL_SENDER_NAME || 'Lop hoc Thanh Man'
      });

      apiPost_('/internal/mark-mail-sent', {
        paymentId: paymentId,
        success: true
      });

      sent++;
    } catch (error) {
      errors++;
      try {
        apiPost_('/internal/mark-mail-sent', {
          paymentId: paymentId,
          success: false,
          error: String(error && error.message ? error.message : error)
        });
      } catch (markErr) {
        Logger.log('mark-mail-sent failed: ' + String(markErr && markErr.message ? markErr.message : markErr));
      }
    }
  }

  return {
    processed: rows.length,
    sent: sent,
    errors: errors,
    cooldownMinutes: cooldown
  };
}

function getDashboardData(weekKey) {
  syncPlayersFromResponses_();
  try {
    processPaidPaymentMailsFromApi_();
  } catch (err) {
    Logger.log('processPaidPaymentMailsFromApi_ failed in getDashboardData: ' + String(err && err.message ? err.message : err));
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
  return getWeekRequests_(weekKey);
}
