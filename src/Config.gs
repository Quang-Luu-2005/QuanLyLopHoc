var ENV = (typeof getEnv_ === 'function') ? getEnv_() : {};

function readScriptProperty_(key, fallbackValue) {
  try {
    var value = PropertiesService.getScriptProperties().getProperty(String(key || '').trim());
    if (value === null || value === undefined || String(value).trim() === '') {
      return fallbackValue;
    }
    return value;
  } catch (err) {
    return fallbackValue;
  }
}

var CONFIG = {
  TARGET: {
    FORM_URL: String(ENV.TARGET_FORM_URL || '').trim(),
    SPREADSHEET_ID: String(ENV.TARGET_SPREADSHEET_ID || '').trim(),
    SPREADSHEET_URL: String(ENV.TARGET_SPREADSHEET_URL || '').trim()
  },
  API: {
    BASE_URL: String(readScriptProperty_('API_BASE_URL', ENV.API_BASE_URL || '')).trim(),
    INTERNAL_API_KEY: String(readScriptProperty_('INTERNAL_API_KEY', ENV.INTERNAL_API_KEY || '')).trim(),
    TIMEOUT_MS: Number(readScriptProperty_('API_TIMEOUT_MS', ENV.API_TIMEOUT_MS || 20000))
  },
  SHEETS: {
    PLAYERS: 'Players',
    SELECTION_LOG: 'Selection_Log',
    WEEKLY_PRIORITY: 'Weekly_Priority',
    SELECTION_COUNT_LOG: 'Selection_Count_Log',
    PAYMENT_REQUESTS: 'Payment_Requests'
  },
  PLAYER_HEADERS: ['Email', 'Name', 'Priority', 'SelectedCount', 'LastSelectedDate', 'LastRequestAt'],
  LOG_HEADERS: ['Timestamp', 'EventDate', 'WeekKey', 'Email', 'Name', 'PriorityAtSelection', 'MailStatus', 'Subject', 'ZaloLink'],
  WEEKLY_PRIORITY_HEADERS: ['WeekKey', 'Email', 'Priority', 'UpdatedAt'],
  SELECTION_COUNT_HEADERS: ['Timestamp', 'WeekKey', 'EventDateKey', 'Email', 'Name', 'Ingame', 'Rank', 'Source'],
  PAYMENT_REQUEST_HEADERS: [
    'RequestId',
    'CreatedAt',
    'UpdatedAt',
    'WeekKey',
    'EventDate',
    'EventDateKey',
    'Email',
    'Name',
    'Ingame',
    'NeedPayment',
    'PaymentStatus',
    'PaymentCode',
    'AmountText',
    'GroupLink',
    'SupportMessage',
    'PayOSOrderCode',
    'PayOSPaymentLinkId',
    'PayOSCheckoutUrl',
    'PayOSQrCode',
    'PaidAt',
    'PaidAmount',
    'PaidContent',
    'PaymentRef',
    'GroupMailSentAt',
    'LastMailAt',
    'LastError'
  ],
  MAIL_SENDER_NAME: String(ENV.MAIL_SENDER_NAME || 'Lớp học Thành Mẫn').trim() || 'Lớp học Thành Mẫn',
  DEFAULT_SUBJECT: 'Thông báo: Bạn đã được chọn thi đấu ngày {{eventDate}}',
  DEFAULT_MESSAGE: 'Nếu cần hỗ trợ, vui lòng liên hệ Zalo: https://zalo.me/0971309547',
  PAYMENT: {
    AMOUNT: Number(ENV.PAYMENT_AMOUNT || readScriptProperty_('DEFAULT_PAYMENT_AMOUNT', 50000)),
    FEE_TEXT: String(ENV.PAYMENT_FEE_TEXT || '50.000đ'),
    NOTE_TEXT: String(ENV.PAYMENT_NOTE_TEXT || 'Bạn vui lòng chuyển khoản để nhận được link group Zalo tham gia buổi thực hành.'),
    CODE_PREFIX: String(ENV.PAYMENT_CODE_PREFIX || 'GE').trim(),
    GROUP_MAIL_COOLDOWN_MINUTES: Number(ENV.PAYMENT_GROUP_MAIL_COOLDOWN_MINUTES || 2)
  },
  RANK_LEVELS: [
    'Nghiệp dư',
    'Bán chuyên',
    'Chuyên nghiệp',
    'Thế giới',
    'Tinh anh',
    'Huyền thoại',
    'Thách đấu',
    'Siêu sao'
  ],
  FORM_SYNC: {
    PROPERTY_LAST_ROW: 'LAST_SYNCED_FORM_ROW',
    BATCH_SIZE: Number(ENV.FORM_SYNC_BATCH_SIZE || 50)
  }
};

function getConfig_() {
  return CONFIG;
}
