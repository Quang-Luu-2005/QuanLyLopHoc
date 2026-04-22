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

function normalizeEventTimeText_(eventTime) {
  var text = String(eventTime || '').trim();
  if (!text) {
    return '';
  }
  var match = text.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (!match) {
    return '';
  }
  return ('0' + String(Number(match[1]))).slice(-2) + ':' + match[2];
}

function buildEventScheduleText_(eventDate, eventTimeText) {
  var dateText = formatDate_(eventDate, 'dd/MM/yyyy');
  var timeText = normalizeEventTimeText_(eventTimeText);
  if (timeText) {
    return dateText + ' lúc ' + timeText;
  }
  return dateText;
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

function toQrBlobFromDataUrl_(dataUrl, fileName) {
  var match = String(dataUrl || '').match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/i);
  if (!match) {
    return null;
  }
  var mimeType = match[1];
  var base64Data = match[2];
  var bytes = Utilities.base64Decode(base64Data);
  return Utilities.newBlob(bytes, mimeType, fileName || 'ma-qr-thanh-toan.png');
}

function toQrBlobFromUrl_(url, fileName) {
  var target = String(url || '').trim();
  if (!/^https?:\/\//i.test(target)) {
    return null;
  }

  try {
    var response = UrlFetchApp.fetch(target, {
      method: 'get',
      muteHttpExceptions: true,
      followRedirects: true
    });
    var status = Number(response.getResponseCode() || 0);
    if (status < 200 || status >= 300) {
      return null;
    }

    var blob = response.getBlob();
    return blob.setName(fileName || 'ma-qr-thanh-toan.png');
  } catch (err) {
    return null;
  }
}

function buildQrImageBlob_(qrCodeValue, checkoutUrl, paymentCode) {
  var fileName = 'ma-qr-' + String(paymentCode || 'payos') + '.png';
  var raw = String(qrCodeValue || '').trim();
  if (!raw && checkoutUrl) {
    raw = String(checkoutUrl || '').trim();
  }
  if (!raw) {
    return null;
  }

  if (/^data:image\//i.test(raw)) {
    return toQrBlobFromDataUrl_(raw, fileName);
  }

  if (/^https?:\/\//i.test(raw)) {
    return toQrBlobFromUrl_(raw, fileName);
  }

  var generatedQrUrl = 'https://quickchart.io/qr?size=360&text=' + encodeURIComponent(raw);
  return toQrBlobFromUrl_(generatedQrUrl, fileName);
}

function buildPaymentInstructionEmailHtmlSimple_(name, eventDateText, customMessage, paymentCode, checkoutUrl, amountText, paymentDeadlineText, includeQrInline) {
  var safeName = escapeHtml_(name || 'Bạn');
  var safeDate = escapeHtml_(eventDateText || 'sắp tới');
  var safeMsg = escapeHtml_(customMessage || CONFIG.DEFAULT_MESSAGE || '');
  var safeCode = escapeHtml_(paymentCode || 'N/A');
  var safeAmount = escapeHtml_(amountText || String((CONFIG.PAYMENT && CONFIG.PAYMENT.FEE_TEXT) || '50.000đ'));
  var safeDeadline = escapeHtml_(paymentDeadlineText || '');
  var safeCheckout = escapeHtml_(checkoutUrl || '');
  var showQr = !!includeQrInline;

  var checkoutBlock = safeCheckout
    ? '<p><a href="' + safeCheckout + '" target="_blank" rel="noopener noreferrer">Thanh toán qua PayOS</a></p>'
    : '';
  var deadlineBlock = safeDeadline
    ? '<p><strong>Hạn thanh toán:</strong> ' + safeDeadline + '</p>'
    : '';
  var qrBlock = showQr
    ? '<p><strong>Mã QR thanh toán:</strong></p>' +
      '<p><img src="cid:paymentQr" alt="Mã QR thanh toán" style="max-width:260px;width:100%;height:auto;border:1px solid #e5e7eb;border-radius:8px"></p>'
    : '';

  return '' +
    '<div style="font-family:Arial,sans-serif;color:#1f2937;line-height:1.6;max-width:620px">' +
    '<p>Chào <strong>' + safeName + '</strong>,</p>' +
    '<p>Bạn đã được chọn thi đấu vào ngày <strong>' + safeDate + '</strong>.</p>' +
    '<p>Bạn cần đóng phí trước khi nhận link nhóm.</p>' +
    '<p><strong>Số tiền:</strong> ' + safeAmount + '</p>' +
    deadlineBlock +
    '<p><strong>Nội dung chuyển khoản:</strong> <code>' + safeCode + '</code></p>' +
    qrBlock +
    checkoutBlock +
    '<p>' + safeMsg + '</p>' +
    '<p>Trân trọng,<br>Ban tổ chức</p>' +
    '</div>';
}

function buildPaymentInstructionEmailTextSimple_(name, eventDateText, customMessage, paymentCode, checkoutUrl, amountText, paymentDeadlineText) {
  var lines = [
    'Chào ' + String(name || 'Bạn'),
    '',
    'Bạn đã được chọn thi đấu vào ngày ' + String(eventDateText || '') + '.',
    'Số tiền: ' + String(amountText || (CONFIG.PAYMENT && CONFIG.PAYMENT.FEE_TEXT) || '50.000đ')
  ];

  if (paymentDeadlineText) {
    lines.push('Hạn thanh toán: ' + String(paymentDeadlineText));
  }

  lines = lines.concat([
    'Nội dung chuyển khoản: ' + String(paymentCode || '')
  ]);

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
  var eventTimeText = normalizeEventTimeText_(payload.eventTime);
  var eventScheduleText = buildEventScheduleText_(eventDate, eventTimeText);
  var paymentDeadlineText = '18:00 ' + eventDateText;

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
      var effectivePaymentCode = String(paymentRes.paymentCode || paymentCode);
      var orderCode = String(paymentRes.orderCode || '').trim();
      if (orderCode) {
        savePayosMailContext_(orderCode, {
          paymentId: String(paymentRes.paymentId || '').trim(),
          paymentCode: effectivePaymentCode,
          email: email,
          name: name,
          ingameName: ingame || name,
          weekKey: weekKey,
          eventDate: eventDateKey,
          eventTime: eventTimeText,
          groupLink: zaloLink,
          supportMessage: customMessage,
          checkoutUrl: String(paymentRes.checkoutUrl || '').trim(),
          qrCode: String(paymentRes.qrCode || '').trim(),
          status: 'PENDING'
        });
      }
      var qrBlob = buildQrImageBlob_(paymentRes.qrCode, paymentRes.checkoutUrl, effectivePaymentCode);
      var mailPayload = {
        to: email,
        subject: 'Yêu cầu thanh toán phí thi đấu ' + eventScheduleText,
        body: buildPaymentInstructionEmailTextSimple_(name, eventScheduleText, customMessage, effectivePaymentCode, paymentRes.checkoutUrl, (CONFIG.PAYMENT && CONFIG.PAYMENT.FEE_TEXT) || '50.000đ', paymentDeadlineText),
        htmlBody: buildPaymentInstructionEmailHtmlSimple_(name, eventScheduleText, customMessage, effectivePaymentCode, paymentRes.checkoutUrl, (CONFIG.PAYMENT && CONFIG.PAYMENT.FEE_TEXT) || '50.000đ', paymentDeadlineText, !!qrBlob),
        name: CONFIG.MAIL_SENDER_NAME || 'Lớp học Thành Mẫn'
      };

      if (qrBlob) {
        mailPayload.inlineImages = { paymentQr: qrBlob };
        mailPayload.attachments = [qrBlob.copyBlob().setName('ma-qr-thanh-toan.png')];
      }

      MailApp.sendEmail(mailPayload);

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

    var groupSubject = subjectTemplate.replace('{{eventDate}}', eventScheduleText);
    MailApp.sendEmail({
      to: email,
      subject: groupSubject,
      htmlBody: buildSelectionEmailHtml_(ingame, eventScheduleText, zaloLink, customMessage, false),
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
    eventDate: eventScheduleText
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
