/**
 * Auto-split module from legacy Code.gs
 */

function savePriorities(payload) {
  ensureSupportSheets_();
  syncPlayersFromResponses_();

  payload = payload || {};
  var weekKey = String(payload.weekKey || '').trim();
  var items = Array.isArray(payload.items) ? payload.items : [];

  if (!weekKey) {
    throw new Error('Không xác định được tuần để lưu ưu tiên.');
  }
  if (!Array.isArray(items)) {
    throw new Error('Dữ liệu ưu tiên không hợp lệ.');
  }

  var saved = saveWeeklyPriorities_(weekKey, items);
  return {
    updated: items.length,
    prioritized: saved.prioritized
  };
}


function sendSelectionEmails(payload) {
  ensureSupportSheets_();
  syncPlayersFromResponses_();

  payload = payload || {};
  var selected = Array.isArray(payload.selected) ? payload.selected : [];

  if (!selected.length) {
    throw new Error('Bạn chưa chọn người nào để gửi mail.');
  }

  var eventDate = parseDateInput_(payload.eventDate);
  if (!eventDate) {
    throw new Error('Ngày thi đấu không hợp lệ.');
  }
  if (eventDate.getDay() !== 4 && eventDate.getDay() !== 5) {
    throw new Error('Ngày thi đấu chỉ được phép là Thứ 5 hoặc Thứ 6.');
  }

  var zaloLink = String(payload.zaloLink || '').trim();
  if (!zaloLink) {
    throw new Error('Bạn cần nhập link nhóm Zalo trước khi gửi.');
  }

  var subjectTemplate = String(payload.subject || CONFIG.DEFAULT_SUBJECT).trim();
  if (!subjectTemplate) {
    subjectTemplate = CONFIG.DEFAULT_SUBJECT;
  }

  var customMessage = String(payload.message || CONFIG.DEFAULT_MESSAGE).trim();
  var weekKey = String(payload.weekKey || '').trim();
  var eventDateText = formatDate_(eventDate, 'dd/MM/yyyy');
  var eventDateKey = formatDate_(eventDate, 'yyyy-MM-dd');
  var paymentMap = buildPaymentRequirementMap_(weekKey);

  var actions = [];
  var skipped = 0;

  for (var c = 0; c < selected.length; c++) {
    var email = normalizeEmail_(selected[c].email);
    if (!email) {
      skipped++;
      continue;
    }

    var ingame = String(selected[c].ingame || selected[c].name || '').trim();
    var name = String(selected[c].name || selected[c].ingame || '').trim();
    if (!name) {
      name = email.split('@')[0];
    }
    if (!ingame) {
      ingame = name;
    }

    var priority = !!selected[c].priority;
    var rank = normalizeFixedRank_(selected[c].rank || '');
    var paymentRequired = resolvePaymentRequired_(selected[c], email, paymentMap);
    var actionType = 'GROUP';
    var request = null;

    if (paymentRequired) {
      request = upsertPaymentRequest_({
        weekKey: weekKey,
        eventDate: eventDate,
        eventDateKey: eventDateKey,
        email: email,
        name: name,
        ingame: ingame,
        groupLink: zaloLink,
        supportMessage: customMessage
      });

      var paymentStatusCode = normalizePaymentStatusCode_(request.paymentStatus);
      if (paymentStatusCode === 'PAID' || paymentStatusCode === 'LINK_SENT') {
        actionType = 'GROUP_AFTER_PAYMENT';
      } else {
        actionType = 'PAYMENT_REQUEST';
      }
    }

    actions.push({
      email: email,
      name: name,
      ingame: ingame,
      priority: priority,
      rank: rank,
      paymentRequired: paymentRequired,
      type: actionType,
      request: request
    });
  }

  if (!actions.length) {
    throw new Error('Không có email hợp lệ để gửi.');
  }

  var quota = MailApp.getRemainingDailyQuota();
  if (actions.length > quota) {
    throw new Error(
      'Không đủ quota gửi mail. Cần gửi ' + actions.length +
      ' mail, nhưng quota còn lại là ' + quota + '.'
    );
  }

  var hasPaymentRecipient = actions.some(function(item) {
    return item.type === 'PAYMENT_REQUEST';
  });

  if (hasPaymentRecipient) {
    validatePayosConfig_();
  }

  var logSheet = getOrCreateSheet_(CONFIG.SHEETS.SELECTION_LOG, CONFIG.LOG_HEADERS);
  var logRows = [];
  var sentItems = [];
  var sent = 0;
  var sentPayment = 0;
  var sentGroup = 0;

  for (var i = 0; i < actions.length; i++) {
    var item = actions[i];
    var subject = '';
    var htmlBody = '';
    var mailStatus = '';
    var mailOptions = {
      to: item.email,
      name: CONFIG.MAIL_SENDER_NAME || 'Lớp học Thành Man'
    };

    if (item.type === 'PAYMENT_REQUEST') {
      var payosData = ensurePayosPaymentLinkForRequest_(item.request);
      var qrBlob = getPaymentQrBlobForRequest_(item.request, payosData);
      subject = buildPaymentEmailSubject_(eventDateText);
      htmlBody = buildPaymentInstructionEmailHtml_(
        item.ingame,
        eventDateText,
        customMessage,
        item.request.paymentCode,
        payosData.checkoutUrl,
        !!qrBlob
      );
      mailOptions.subject = subject;
      mailOptions.body = buildPaymentInstructionEmailText_(
        item.ingame,
        eventDateText,
        customMessage,
        item.request.paymentCode,
        payosData.checkoutUrl
      );
      mailOptions.htmlBody = htmlBody;
      if (qrBlob) {
        mailOptions.inlineImages = {
          payosqr: qrBlob
        };
      }
      mailStatus = 'SENT_PAYMENT_REQUEST';
    } else {
      subject = subjectTemplate.replace('{{eventDate}}', eventDateText);
      htmlBody = buildSelectionEmailHtml_(item.ingame, eventDateText, zaloLink, customMessage, false);
      mailOptions.subject = subject;
      mailOptions.htmlBody = htmlBody;
      mailStatus = item.type === 'GROUP_AFTER_PAYMENT' ? 'SENT_GROUP_AFTER_PAYMENT' : 'SENT_GROUP';
    }

    MailApp.sendEmail(mailOptions);
    sent++;

    if (item.type === 'PAYMENT_REQUEST') {
      sentPayment++;
      if (item.request) {
        updatePaymentRequestRow_(item.request.rowIndex, function(values, idx) {
          values[idx.paymentStatus] = 'PENDING';
          values[idx.groupLink] = zaloLink;
          values[idx.supportMessage] = customMessage;
          values[idx.lastMailAt] = new Date();
          values[idx.lastError] = '';
        }, {
          source: 'SEND_PAYMENT_EMAIL',
          note: 'Send payment request email'
        });
      }
    } else {
      sentGroup++;
      if (item.request) {
        updatePaymentRequestRow_(item.request.rowIndex, function(values, idx) {
          values[idx.paymentStatus] = 'LINK_SENT';
          values[idx.groupLink] = zaloLink;
          values[idx.supportMessage] = customMessage;
          values[idx.groupMailSentAt] = new Date();
          values[idx.lastMailAt] = new Date();
          values[idx.lastError] = '';
        }, {
          source: 'SEND_GROUP_EMAIL',
          note: 'Send group link email'
        });
      }
    }

    logRows.push([
      new Date(),
      eventDate,
      weekKey,
      item.email,
      item.name,
      item.priority,
      mailStatus,
      subject,
      zaloLink
    ]);

    sentItems.push({
      email: item.email,
      name: item.name,
      ingame: item.ingame,
      rank: item.rank
    });
  }

  if (logRows.length) {
    logSheet.getRange(logSheet.getLastRow() + 1, 1, logRows.length, CONFIG.LOG_HEADERS.length)
      .setValues(logRows);
  }

  var countResult = countSelections_(weekKey, eventDate, sentItems, 'MAIL_SENT');

  return {
    total: selected.length,
    valid: actions.length,
    sent: sent,
    skipped: skipped,
    sentGroup: sentGroup,
    sentPayment: sentPayment,
    paymentSent: sentPayment,
    countAdded: countResult.added,
    countSkipped: countResult.skipped,
    eventDate: eventDateText
  };
}


function markPaymentsPaidManual(payload) {
  ensureSupportSheets_();
  syncPlayersFromResponses_();

  payload = payload || {};
  var weekKey = String(payload.weekKey || '').trim();
  if (!weekKey) {
    throw new Error('Bạn cần chọn tuần trước khi cập nhật thanh toán.');
  }

  var eventDate = parseDateInput_(payload.eventDate);
  if (!eventDate) {
    throw new Error('Ngày thi đấu không hợp lệ.');
  }
  if (eventDate.getDay() !== 4 && eventDate.getDay() !== 5) {
    throw new Error('Ngày thi đấu chỉ được phép là Thứ 5 hoặc Thứ 6.');
  }

  var selected = Array.isArray(payload.selected) ? payload.selected : [];
  if (!selected.length) {
    throw new Error('Bạn chưa chọn người nào để cập nhật thanh toán.');
  }

  var zaloLink = String(payload.zaloLink || '').trim();
  var supportMessage = String(payload.message || '').trim();
  var eventDateKey = formatDate_(eventDate, 'yyyy-MM-dd');
  var eventDateText = formatDate_(eventDate, 'dd/MM/yyyy');
  var paymentMap = buildPaymentRequirementMap_(weekKey);

  var candidates = [];
  var seen = {};
  var skippedInvalid = 0;
  var skippedDuplicate = 0;
  var skippedNoPaymentNeeded = 0;

  for (var i = 0; i < selected.length; i++) {
    var email = normalizeEmail_(selected[i].email);
    if (!email) {
      skippedInvalid++;
      continue;
    }
    if (seen[email]) {
      skippedDuplicate++;
      continue;
    }
    seen[email] = true;

    var paymentRequired = resolvePaymentRequired_(selected[i], email, paymentMap);
    if (!paymentRequired) {
      skippedNoPaymentNeeded++;
      continue;
    }

    var ingame = String(selected[i].ingame || selected[i].name || '').trim();
    var name = String(selected[i].name || selected[i].ingame || '').trim();
    if (!name) {
      name = email.split('@')[0];
    }
    if (!ingame) {
      ingame = name;
    }

    candidates.push({
      email: email,
      name: name,
      ingame: ingame
    });
  }

  if (!candidates.length) {
    throw new Error('Danh sách chọn không có ai thuộc diện cần cập nhật thanh toán.');
  }

  var paidUpdated = 0;
  var skippedAlreadyPaid = 0;
  var errors = 0;
  var paidUpdatedEmails = [];
  var alreadyPaidEmails = [];

  for (var c = 0; c < candidates.length; c++) {
    var candidate = candidates[c];
    var request = findLatestPaymentRequest_(weekKey, eventDateKey, candidate.email);

    if (!request) {
      request = upsertPaymentRequest_({
        weekKey: weekKey,
        eventDate: eventDate,
        eventDateKey: eventDateKey,
        email: candidate.email,
        name: candidate.name,
        ingame: candidate.ingame,
        groupLink: zaloLink,
        supportMessage: supportMessage
      });
    } else {
      request = updatePaymentRequestRow_(request.rowIndex, function(values, idx) {
        values[idx.name] = candidate.name;
        values[idx.ingame] = candidate.ingame;
        values[idx.needPayment] = true;
        values[idx.amountText] = String((CONFIG.PAYMENT && CONFIG.PAYMENT.FEE_TEXT) || '50.000đ');
        values[idx.groupLink] = zaloLink;
        values[idx.supportMessage] = supportMessage;
        if (!values[idx.paymentCode]) {
          values[idx.paymentCode] = generatePaymentCode_(values[idx.requestId] || Utilities.getUuid());
        }
      });
    }

    var statusCode = normalizePaymentStatusCode_(request.paymentStatus);
    if (statusCode === 'PAID' || statusCode === 'LINK_SENT') {
      skippedAlreadyPaid++;
      alreadyPaidEmails.push(candidate.email);
      continue;
    }

    request = updatePaymentRequestRow_(request.rowIndex, function(values, idx) {
      values[idx.paymentStatus] = 'PAID';
      values[idx.paidAt] = new Date();
      values[idx.paidAmount] = getPaymentAmount_();
      values[idx.paidContent] = 'MANUAL_UI_UPDATE';
      values[idx.paymentRef] = 'MANUAL_UI';
      values[idx.groupLink] = zaloLink;
      values[idx.supportMessage] = supportMessage;
      values[idx.lastError] = '';
    }, {
      source: 'MANUAL_MARK_PAID',
      note: 'Manual mark paid from UI'
    });
    paidUpdated++;
    paidUpdatedEmails.push(candidate.email);
  }

  return {
    totalSelected: selected.length,
    candidates: candidates.length,
    paidUpdated: paidUpdated,
    sentGroup: 0,
    skippedInvalid: skippedInvalid,
    skippedDuplicate: skippedDuplicate,
    skippedNoPaymentNeeded: skippedNoPaymentNeeded,
    skippedAlreadySent: skippedAlreadyPaid,
    paidUpdatedEmails: paidUpdatedEmails,
    sentGroupEmails: [],
    skippedAlreadySentEmails: alreadyPaidEmails,
    alreadyPaidEmails: alreadyPaidEmails,
    errors: errors,
    eventDate: eventDateText
  };
}
