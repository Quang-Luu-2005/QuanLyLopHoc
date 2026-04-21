/**
 * Selection service (PostgreSQL-first).
 */

function validateEventDate_(eventDate) {
  if (!eventDate) {
    throw new Error('Ngay thi dau khong hop le.');
  }
  var day = eventDate.getDay();
  if (day !== 4 && day !== 5) {
    throw new Error('Ngay thi dau chi duoc phep la Thu 5 hoac Thu 6.');
  }
}

function buildPaymentInstructionEmailHtmlSimple_(name, eventDateText, customMessage, paymentCode, checkoutUrl, amountText) {
  var safeName = escapeHtml_(name || 'Ban');
  var safeDate = escapeHtml_(eventDateText || 'sap toi');
  var safeMsg = escapeHtml_(customMessage || CONFIG.DEFAULT_MESSAGE || '');
  var safeCode = escapeHtml_(paymentCode || 'N/A');
  var safeAmount = escapeHtml_(amountText || String((CONFIG.PAYMENT && CONFIG.PAYMENT.FEE_TEXT) || '50.000d'));
  var safeCheckout = escapeHtml_(checkoutUrl || '');

  var checkoutBlock = safeCheckout
    ? '<p><a href="' + safeCheckout + '" target="_blank" rel="noopener noreferrer">Thanh toan qua PayOS</a></p>'
    : '';

  return '' +
    '<div style="font-family:Arial,sans-serif;color:#1f2937;line-height:1.6;max-width:620px">' +
    '<p>Chao <strong>' + safeName + '</strong>,</p>' +
    '<p>Ban da duoc chon thi dau vao ngay <strong>' + safeDate + '</strong>.</p>' +
    '<p>Ban can dong phi truoc khi nhan link nhom.</p>' +
    '<p><strong>So tien:</strong> ' + safeAmount + '</p>' +
    '<p><strong>Noi dung chuyen khoan:</strong> <code>' + safeCode + '</code></p>' +
    checkoutBlock +
    '<p>' + safeMsg + '</p>' +
    '<p>Tran trong,<br>Ban to chuc</p>' +
    '</div>';
}

function buildPaymentInstructionEmailTextSimple_(name, eventDateText, customMessage, paymentCode, checkoutUrl, amountText) {
  var lines = [
    'Chao ' + String(name || 'Ban'),
    '',
    'Ban da duoc chon thi dau vao ngay ' + String(eventDateText || '') + '.',
    'So tien: ' + String(amountText || (CONFIG.PAYMENT && CONFIG.PAYMENT.FEE_TEXT) || '50.000d'),
    'Noi dung chuyen khoan: ' + String(paymentCode || '')
  ];

  if (checkoutUrl) {
    lines.push('Thanh toan PayOS: ' + String(checkoutUrl));
  }

  if (customMessage) {
    lines.push('', String(customMessage));
  }

  lines.push('', 'Tran trong,', 'Ban to chuc');
  return lines.join('\n');
}

function savePriorities(payload) {
  payload = payload || {};
  var weekKey = String(payload.weekKey || '').trim();
  var items = Array.isArray(payload.items) ? payload.items : [];

  if (!weekKey) {
    throw new Error('Khong xac dinh duoc tuan de luu uu tien.');
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
    throw new Error('Ban chua chon nguoi nao de gui mail.');
  }

  var weekKey = String(payload.weekKey || '').trim();
  if (!weekKey) {
    throw new Error('Ban can chon tuan truoc khi gui mail.');
  }

  var eventDate = parseDateInput_(payload.eventDate);
  validateEventDate_(eventDate);

  var zaloLink = String(payload.zaloLink || '').trim();
  if (!zaloLink) {
    throw new Error('Ban can nhap link nhom Zalo truoc khi gui.');
  }

  var subjectTemplate = String(payload.subject || CONFIG.DEFAULT_SUBJECT || '').trim() || CONFIG.DEFAULT_SUBJECT;
  var customMessage = String(payload.message || CONFIG.DEFAULT_MESSAGE || '').trim();
  var eventDateText = formatDate_(eventDate, 'dd/MM/yyyy');
  var eventDateKey = formatDate_(eventDate, 'yyyy-MM-dd');

  var quota = MailApp.getRemainingDailyQuota();
  if (selected.length > quota) {
    throw new Error('Khong du quota gui mail. Can ' + selected.length + ', con lai ' + quota + '.');
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
      var paymentRes = apiPost_('/internal/create-payment', {
        playerId: item.playerId || null,
        submissionId: item.submissionId || null,
        email: email,
        ingameName: ingame,
        buyerName: name,
        buyerEmail: email,
        amount: Number((CONFIG.PAYMENT && CONFIG.PAYMENT.AMOUNT) || 50000),
        description: String((CONFIG.PAYMENT && CONFIG.PAYMENT.CODE_PREFIX) || 'GE') + '_' + eventDateKey + '_' + email,
        weekKey: weekKey,
        eventDate: eventDateKey,
        groupLink: zaloLink,
        supportMessage: customMessage,
        needPayment: true
      });

      MailApp.sendEmail({
        to: email,
        subject: 'Yeu cau thanh toan phi thi dau ngay ' + eventDateText,
        body: buildPaymentInstructionEmailTextSimple_(name, eventDateText, customMessage, paymentRes.paymentCode, paymentRes.checkoutUrl, (CONFIG.PAYMENT && CONFIG.PAYMENT.FEE_TEXT) || '50.000d'),
        htmlBody: buildPaymentInstructionEmailHtmlSimple_(name, eventDateText, customMessage, paymentRes.paymentCode, paymentRes.checkoutUrl, (CONFIG.PAYMENT && CONFIG.PAYMENT.FEE_TEXT) || '50.000d'),
        name: CONFIG.MAIL_SENDER_NAME || 'Lop hoc Thanh Man'
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
      name: CONFIG.MAIL_SENDER_NAME || 'Lop hoc Thanh Man'
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
    throw new Error('Ban can chon tuan truoc khi cap nhat thanh toan.');
  }

  var eventDate = parseDateInput_(payload.eventDate);
  validateEventDate_(eventDate);

  var selected = Array.isArray(payload.selected) ? payload.selected : [];
  if (!selected.length) {
    throw new Error('Ban chua chon nguoi nao de cap nhat thanh toan.');
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
