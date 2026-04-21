/**
 * Auto-split module from legacy Code.gs
 */

function getWeekStart_(dateObj) {
  var date = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());
  var day = date.getDay();
  var offset = (day + 6) % 7;
  date.setDate(date.getDate() - offset);
  return date;
}


function buildWeekLabel_(startDate) {
  var endDate = new Date(startDate.getTime());
  endDate.setDate(endDate.getDate() + 6);
  return 'Tuần ' + formatDate_(startDate, 'dd/MM/yyyy') + ' - ' + formatDate_(endDate, 'dd/MM/yyyy');
}


function parseDateInput_(value) {
  if (!value && value !== 0) {
    return null;
  }

  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  var text = String(value).trim();
  var match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }

  var parsed = new Date(text);
  if (isNaN(parsed.getTime())) {
    return null;
  }

  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}


function toDate_(value) {
  if (!value && value !== 0) {
    return null;
  }

  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return value;
  }

  var parsed = new Date(value);
  if (isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}


function formatDate_(date, pattern) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), pattern);
}


function normalizeEmail_(value) {
  return String(value || '').trim().toLowerCase();
}


function toBoolean_(value) {
  return value === true || String(value).toLowerCase() === 'true' || Number(value) === 1;
}


function getTargetSpreadsheet_() {
  var targetId = CONFIG.TARGET && CONFIG.TARGET.SPREADSHEET_ID;
  if (targetId) {
    return SpreadsheetApp.openById(targetId);
  }
  return SpreadsheetApp.getActive();
}


function getTargetForm_() {
  var formUrls = [];
  if (CONFIG.TARGET && CONFIG.TARGET.FORM_URL) {
    formUrls.push(CONFIG.TARGET.FORM_URL);
  }

  var linkedFormUrl = getTargetSpreadsheet_().getFormUrl();
  if (linkedFormUrl) {
    formUrls.push(linkedFormUrl);
  }

  for (var i = 0; i < formUrls.length; i++) {
    try {
      return FormApp.openByUrl(formUrls[i]);
    } catch (err) {
      // Try next candidate URL.
    }
  }

  throw new Error(
    'Không mở được Google Form từ URL cấu hình. Vui lòng kiểm tra lại quyền truy cập Form hoặc link Form.'
  );
}


function ensureFormDestination_() {
  var targetSpreadsheetId = CONFIG.TARGET && CONFIG.TARGET.SPREADSHEET_ID;
  if (!targetSpreadsheetId) {
    return { ok: false, message: 'Chưa cấu hình Spreadsheet ID đích.' };
  }

  try {
    var form = getTargetForm_();
    var currentDestinationId = '';

    try {
      currentDestinationId = form.getDestinationId() || '';
    } catch (err) {
      currentDestinationId = '';
    }

    if (currentDestinationId === targetSpreadsheetId) {
      return { ok: true, message: 'Form đã trỏ đúng Sheet đích.' };
    }

    form.setDestination(FormApp.DestinationType.SPREADSHEET, targetSpreadsheetId);
    return { ok: true, message: 'Đã cập nhật Form trỏ về Sheet đích.' };
  } catch (error) {
    return {
      ok: false,
      message: 'Không thể thiết lập Sheet đích cho Form: ' + error.message
    };
  }
}


function buildEventDateOptions_(weekKey) {
  if (!weekKey) {
    return [];
  }

  var monday = parseDateInput_(weekKey);
  if (!monday) {
    return [];
  }

  var thu5 = new Date(monday.getTime());
  thu5.setDate(thu5.getDate() + 3);
  var thu6 = new Date(monday.getTime());
  thu6.setDate(thu6.getDate() + 4);

  return [
    {
      value: formatDate_(thu5, 'yyyy-MM-dd'),
      label: 'Thứ 5 - ' + formatDate_(thu5, 'dd/MM/yyyy')
    },
    {
      value: formatDate_(thu6, 'yyyy-MM-dd'),
      label: 'Thứ 6 - ' + formatDate_(thu6, 'dd/MM/yyyy')
    }
  ];
}


function readWeeklyPriorities_(weekKey) {
  var map = {};
  var key = String(weekKey || '').trim();
  if (!key) {
    return map;
  }

  var rows = getWeekRequests_(key);
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].priority) {
      map[normalizeEmail_(rows[i].email)] = true;
    }
  }

  return map;
}


function saveWeeklyPriorities_(weekKey, items) {
  var result = apiPost_('/internal/save-priorities', {
    weekKey: String(weekKey || '').trim(),
    items: Array.isArray(items) ? items : []
  });

  return {
    prioritized: Number(result.prioritized || 0)
  };
}


function normalizeFixedRank_(value) {
  var text = String(value || '').trim();
  if (!text) {
    return 'Không rõ';
  }

  var normalized = normalizeSearchText_(text);

  var mapping = [
    { key: 'nghiep du', label: 'Nghiệp dư' },
    { key: 'ban chuyen', label: 'Bán chuyên' },
    { key: 'chuyen nghiep', label: 'Chuyên nghiệp' },
    { key: 'the gioi', label: 'Thế giới' },
    { key: 'tinh anh', label: 'Tinh anh' },
    { key: 'huyen thoai', label: 'Huyền thoại' },
    { key: 'thach dau', label: 'Thách đấu' },
    { key: 'thach au', label: 'Thách đấu' },
    { key: 'sieu sao', label: 'Siêu sao' }
  ];

  for (var i = 0; i < mapping.length; i++) {
    if (normalized.indexOf(mapping[i].key) !== -1) {
      return mapping[i].label;
    }
  }

  return 'Không rõ';
}
function normalizeSearchText_(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[đĐ]/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function notifyUser_(message, title, timeoutSeconds) {
  var safeTitle = title || 'GatherEasy';
  var safeTimeout = timeoutSeconds || 5;
  var safeMessage = String(message || '');

  try {
    getTargetSpreadsheet_().toast(safeMessage, safeTitle, safeTimeout);
  } catch (err) {
    Logger.log(safeTitle + ': ' + safeMessage);
  }
}


function buildSelectionEmailHtml_(name, eventDateText, zaloLink, customMessage, paymentRequired) {
  var safeName = escapeHtml_(name);
  var safeDate = escapeHtml_(eventDateText);
  var safeLink = escapeHtml_(zaloLink);
  var safeMessage = escapeHtml_(customMessage);
  var needPayment = !!paymentRequired;
  var paymentBlock = '';

  if (needPayment) {
    var feeText = escapeHtml_(String((CONFIG.PAYMENT && CONFIG.PAYMENT.FEE_TEXT) || '50.000đ'));
    var noteText = escapeHtml_(String((CONFIG.PAYMENT && CONFIG.PAYMENT.NOTE_TEXT) || 'Bạn vui lòng chuyển khoản trước khi thi đấu.'));

    paymentBlock =
      '<div style="margin:14px 0;padding:12px;border:1px solid #f59e0b;border-radius:8px;background:#fffbeb">' +
      '<p style="margin:0 0 8px"><strong>Thông tin đóng phí:</strong> ' + feeText + '</p>' +
      '<p style="margin:0 0 8px">' + noteText + '</p>' +
      '<p style="margin:0 0 8px">Vui lòng quét QR bên dưới để chuyển khoản:</p>' +
      '<p style="margin:0"><img src="cid:paymentQr" alt="QR chuyển khoản" style="max-width:260px;width:100%;height:auto;border:1px solid #e5e7eb;border-radius:8px"></p>' +
      '</div>';
  }

  return '' +
    '<div style="font-family:Arial,sans-serif;color:#1f2937;line-height:1.6;max-width:620px">' +
    '<p>Chào <strong>' + safeName + '</strong>,</p>' +
    '<p>Bạn đã được chọn thi đấu vào ngày <strong>' + safeDate + '</strong>.</p>' +
    '<p>' + safeMessage + '</p>' +
    paymentBlock +
    '<p>Vui lòng vào nhóm Zalo để nhận thông tin chi tiết:</p>' +
    '<p><a href="' + safeLink + '" target="_blank" rel="noopener noreferrer">Tham gia nhóm Zalo</a></p>' +
    '<p>Hẹn gặp bạn trên sân.</p>' +
    '<p>Trân trọng,<br>Ban tổ chức</p>' +
    '</div>';
}


function escapeHtml_(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}


