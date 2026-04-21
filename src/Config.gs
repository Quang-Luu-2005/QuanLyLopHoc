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
  MAIL_SENDER_NAME: String(ENV.MAIL_SENDER_NAME || 'Lop hoc Thanh Man').trim() || 'Lop hoc Thanh Man',
  DEFAULT_SUBJECT: 'Thong bao: Ban da duoc chon thi dau ngay {{eventDate}}',
  DEFAULT_MESSAGE: 'Neu can ho tro, vui long lien he Zalo: https://zalo.me/0971309547',
  PAYMENT: {
    AMOUNT: Number(ENV.PAYMENT_AMOUNT || readScriptProperty_('DEFAULT_PAYMENT_AMOUNT', 50000)),
    FEE_TEXT: String(ENV.PAYMENT_FEE_TEXT || '50.000d'),
    NOTE_TEXT: String(ENV.PAYMENT_NOTE_TEXT || 'Ban vui long chuyen khoan de nhan duoc link group Zalo tham gia buoi thuc hanh.'),
    CODE_PREFIX: String(ENV.PAYMENT_CODE_PREFIX || 'GE').trim(),
    GROUP_MAIL_COOLDOWN_MINUTES: Number(ENV.PAYMENT_GROUP_MAIL_COOLDOWN_MINUTES || 2)
  },
  RANK_LEVELS: [
    'Nghiep du',
    'Ban chuyen',
    'Chuyen nghiep',
    'The gioi',
    'Tinh anh',
    'Huyen thoai',
    'Thach dau',
    'Sieu sao'
  ],
  FORM_SYNC: {
    PROPERTY_LAST_ROW: 'LAST_SYNCED_FORM_ROW',
    BATCH_SIZE: Number(ENV.FORM_SYNC_BATCH_SIZE || 50)
  }
};

function getConfig_() {
  return CONFIG;
}
