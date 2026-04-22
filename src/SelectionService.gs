/**
 * Dịch vụ chọn người (ưu tiên MongoDB).
 */

function validateEventDate_(eventDate) {
  if (!eventDate) {
    throw new Error('Ngày thi đấu không hợp lệ.');
  }
  var day = eventDate.getDay();
  if (day !== 4 && day !== 5) {
    throw new Error('Ngày thi đấu chỉ được phép là Thứ 5 hoặc Thứ 6.');
  }
}

function buildPayosDescription_(eventDateKey, email) {
  var prefix = String((CONFIG.PAYMENT && CONFIG.PAYMENT.CODE_PREFIX) || 'GE')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase() || 'GE';
  var dateToken = String(eventDateKey || '').replace(/[^0-9]/g, '');
  if (dateToken.length > 6) {
    dateToken = dateToken.slice(-6);
  }
  var emailToken = String(email || '')
    .split('@')[0]
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase()
    .slice(0, 10);

  var value = [prefix, dateToken, emailToken].join('');
  if (!value) {
    value = prefix + String(Date.now()).slice(-8);
  }
  return value.slice(0, 25);
}

function buildPaymentInstructionEmailHtmlSimple_(name, eventDateText, customMessage, paymentCode, checkoutUrl, amountText) {
  var safeName = escapeHtml_(name || 'Bạn');
  var safeDate = escapeHtml_(eventDateText || 'sắp tới');
  var safeMsg = escapeHtml_(customMessage || CONFIG.DEFAULT_MESSAGE || '');
  var safeCode = escapeHtml_(paymentCode || 'N/A');
  var safeAmount = escapeHtml_(amountText || String((CONFIG.PAYMENT && CONFIG.PAYMENT.FEE_TEXT) || '50.000đ'));
  var safeCheckout = escapeHtml_(checkoutUrl || '');

  var checkoutBlock = safeCheckout
    ? '<p><a href="' + safeCheckout + '" target="_blank" rel="noopener noreferrer">Thanh toán qua PayOS</a></p>'
    : '';

  return '' +
    '<div style="font-family:Arial,sans-serif;color:#1f2937;line-height:1.6;max-width:620px">' +
    '<p>Chào <strong>' + safeName + '</strong>,</p>' +
    '<p>Bạn đã được chọn thi đấu vào ngày <strong>' + safeDate + '</strong>.</p>' +
    '<p>Bạn cần đóng phí trước khi nhận link nhóm.</p>' +
    '<p><strong>Số tiền:</strong> ' + safeAmount + '</p>' +
    '<p><strong>Nội dung chuyển khoản:</strong> <code>' + safeCode + '</code></p>' +
    checkoutBlock +
    '<p>' + safeMsg + '</p>' +
    '<p>Trân trọng,<br>Ban tổ chức</p>' +
    '</div>';
}

function buildPaymentInstructionEmailTextSimple_(name, eventDateText, customMessage, paymentCode, checkoutUrl, amountText) {
  var lines = [
    'Chào ' + String(name || 'Bạn'),
    '',
    'Bạn đã được chọn thi đấu vào ngày ' + String(eventDateText || '') + '.',
    'Số tiền: ' + String(amountText || (CONFIG.PAYMENT && CONFIG.PAYMENT.FEE_TEXT) || '50.000đ'),
    'Nội dung chuyển khoản: ' + String(paymentCode || '')
  ];

  if (checkoutUrl) {
    lines.push('Thanh toán PayOS: ' + String(checkoutUrl));
  }

  if (customMessage) {
    lines.push('', String(customMessage));
  }

  lines.push('', 'Trân trọng,', 'Ban tổ chức');
  return lines.join('\n');
}

function savePriorities(payload) {
  payload = payload || {};
  var weekKey = String(payload.weekKey || '').trim();
  var items = Array.isArray(payload.items) ? payload.items : [];

  if (!weekKey) {
    throw new Error('Không xác định được tuần để lưu ưu tiên.');
  }

  var result = apiPost_('/internal/save-priorities', {
    weekKey: weekKey,
    items: items
  });

  return {
    updated: Number(result.updated || items.length),
    prioritized: Number(result.prioritized || 0)
  };
}

function sendSelectionEmails(payload) {
  payload = payload || {};
  var selected = Array.isArray(payload.selected) ? payload.selected : [];
  if (!selected.length) {
    throw new Error('Bạn chưa chọn người nào để gửi mail.');
  }

  var weekKey = String(payload.weekKey || '').trim();
  if (!weekKey) {
    throw new Error('Bạn cần chọn tuần trước khi gửi mail.');
  }

  var eventDate = parseDateInput_(payload.eventDate);
  validateEventDate_(eventDate);

  var zaloLink = String(payload.zaloLink || '').trim();
  if (!zaloLink) {
    throw new Error('Bạn cần nhập link nhóm Zalo trước khi gửi.');
  }

  var subjectTemplate = String(payload.subject || CONFIG.DEFAULT_SUBJECT || '').trim() || CONFIG.DEFAULT_SUBJECT;
  var customMessage = String(payload.message || CONFIG.DEFAULT_MESSAGE || '').trim();
  var eventDateText = formatDate_(eventDate, 'dd/MM/yyyy');
  var eventDateKey = formatDate_(eventDate, 'yyyy-MM-dd');

  var quota = MailApp.getRemainingDailyQuota();
  if (selected.length > quota) {
    throw new Error('Không đủ quota gửi mail. Cần ' + selected.length + ', còn lại ' + quota + '.');
  }

  var sentItems = [];
  var sent = 0;
  var sentGroup = 0;
  var sentPayment = 0;
  var skipped = 0;

  for (var i = 0; i < selected.length; i++) {
    var item = selected[i] || {};
    var email = normalizeEmail_(item.email);
    if (!email) {
      skipped++;
      continue;
    }

    var ingame = String(item.ingame || item.name || email.split('@')[0]).trim();
    var name = String(item.name || item.ingame || ingame).trim();
    var rank = String(item.rank || item.rankNormalized || '');
    var paymentRequired = !!item.paymentRequired;

    if (paymentRequired) {
      var paymentCode = buildPayosDescription_(eventDateKey, email);
      var paymentRes = apiPost_('/internal/create-payment', {
        playerId: item.playerId || null,
        submissionId: item.submissionId || null,
        email: email,
        ingameName: ingame,
        buyerName: name,
        buyerEmail: email,
        paymentCode: paymentCode,
        amount: Number((CONFIG.PAYMENT && CONFIG.PAYMENT.AMOUNT) || 50000),
        description: paymentCode,
        weekKey: weekKey,
        eventDate: eventDateKey,
        groupLink: zaloLink,
        supportMessage: customMessage,
        needPayment: true
      });

      MailApp.sendEmail({
        to: email,
        subject: 'Yêu cầu thanh toán phí thi đấu ngày ' + eventDateText,
        body: buildPaymentInstructionEmailTextSimple_(name, eventDateText, customMessage, paymentRes.paymentCode || paymentCode, paymentRes.checkoutUrl, (CONFIG.PAYMENT && CONFIG.PAYMENT.FEE_TEXT) || '50.000đ'),
        htmlBody: buildPaymentInstructionEmailHtmlSimple_(name, eventDateText, customMessage, paymentRes.paymentCode || paymentCode, paymentRes.checkoutUrl, (CONFIG.PAYMENT && CONFIG.PAYMENT.FEE_TEXT) || '50.000đ'),
        name: CONFIG.MAIL_SENDER_NAME || 'Lớp học Thành Mẫn'
      });

      sent++;
      sentPayment++;
      sentItems.push({
        email: email,
        name: name,
        ingame: ingame,
        rank: rank
      });
      continue;
    }

    var groupSubject = subjectTemplate.replace('{{eventDate}}', eventDateText);
    MailApp.sendEmail({
      to: email,
      subject: groupSubject,
      htmlBody: buildSelectionEmailHtml_(ingame, eventDateText, zaloLink, customMessage, false),
      name: CONFIG.MAIL_SENDER_NAME || 'Lớp học Thành Mẫn'
    });

    sent++;
    sentGroup++;
    sentItems.push({
      email: email,
      name: name,
      ingame: ingame,
      rank: rank
    });
  }

  var countResult = countSelections_(weekKey, eventDate, sentItems, 'MAIL_SENT');

  return {
    total: selected.length,
    valid: sentItems.length,
    sent: sent,
    skipped: skipped,
    sentGroup: sentGroup,
    sentPayment: sentPayment,
    paymentSent: sentPayment,
    countAdded: Number(countResult.added || 0),
    countSkipped: Number(countResult.skipped || 0),
    eventDate: eventDateText
  };
}

function markPaymentsPaidManual(payload) {
  payload = payload || {};
  var weekKey = String(payload.weekKey || '').trim();
  if (!weekKey) {
    throw new Error('Bạn cần chọn tuần trước khi cập nhật thanh toán.');
  }

  var eventDate = parseDateInput_(payload.eventDate);
  validateEventDate_(eventDate);

  var selected = Array.isArray(payload.selected) ? payload.selected : [];
  if (!selected.length) {
    throw new Error('Bạn chưa chọn người nào để cập nhật thanh toán.');
  }

  var result = apiPost_('/internal/mark-payments-paid-manual', {
    weekKey: weekKey,
    eventDate: formatDate_(eventDate, 'yyyy-MM-dd'),
    selected: selected,
    zaloLink: String(payload.zaloLink || '').trim(),
    supportMessage: String(payload.message || '').trim(),
    amount: Number((CONFIG.PAYMENT && CONFIG.PAYMENT.AMOUNT) || 50000)
  });

  result.eventDate = formatDate_(eventDate, 'dd/MM/yyyy');
  return result;
}
