var ENV = (typeof getEnv_ === 'function') ? getEnv_() : {};

var CONFIG = {
  TARGET: {
    FORM_URL: String(ENV.TARGET_FORM_URL || 'https://forms.gle/5PfrDPZ8A7nS3s337').trim(),
    SPREADSHEET_ID: String(ENV.TARGET_SPREADSHEET_ID || '1lzhf6hx1Qc95ugAk6DXL__qmI11gkbULXZEZuH6Q0X4').trim(),
    SPREADSHEET_URL: String(ENV.TARGET_SPREADSHEET_URL || 'https://docs.google.com/spreadsheets/d/1lzhf6hx1Qc95ugAk6DXL__qmI11gkbULXZEZuH6Q0X4/edit?usp=sharing').trim()
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
  PAYMENT_STATUS_LOG_HEADERS: [
    'Timestamp',
    'WeekKey',
    'EventDateKey',
    'Email',
    'Name',
    'Ingame',
    'PaymentCode',
    'PaymentStatus',
    'PaidAmount',
    'PaymentRef',
    'PayOSOrderCode',
    'PayOSPaymentLinkId',
    'PayOSCheckoutUrl',
    'Source',
    'Note'
  ],
  PAYMENT_STATUS: {
    SPREADSHEET_ID: String(ENV.PAYMENT_STATUS_SPREADSHEET_ID || '1wyCpBgiRMNpZAuPe_2-ZZH4FfeslH-fxYLQFRAbknE8').trim(),
    SHEET_NAME: String(ENV.PAYMENT_STATUS_SHEET_NAME || 'Payment_Status_Log').trim()
  },
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
  MAIL_SENDER_NAME: String(ENV.MAIL_SENDER_NAME || 'Lớp học Thành Man').trim() || 'Lớp học Thành Man',
  DEFAULT_SUBJECT: 'Thông báo: Bạn đã được chọn thi đấu ngày {{eventDate}}',
  DEFAULT_MESSAGE: 'Nếu cần hỗ trợ, vui lòng liên hệ Zalo: https://zalo.me/0971309547',
  PAYMENT: {
    AMOUNT: Number(ENV.PAYMENT_AMOUNT || 50000),
    FEE_TEXT: String(ENV.PAYMENT_FEE_TEXT || '50.000đ'),
    NOTE_TEXT: String(ENV.PAYMENT_NOTE_TEXT || 'Bạn vui lòng chuyển khoản để nhận được link group zalo tham gia buổi thực hành.'),
    QR_DRIVE_FILE_ID: String(ENV.PAYMENT_QR_DRIVE_FILE_ID || '').trim(),
    CODE_PREFIX: String(ENV.PAYMENT_CODE_PREFIX || 'GE').trim(),
    TIMEOUT_HOURS: Number(ENV.PAYMENT_TIMEOUT_HOURS || 12),
    GROUP_MAIL_COOLDOWN_MINUTES: Number(ENV.PAYMENT_GROUP_MAIL_COOLDOWN_MINUTES || 2),
    WEBHOOK_TOKEN: String(ENV.PAYMENT_WEBHOOK_TOKEN || '').trim(),
    PAYOS_CLIENT_ID: String(ENV.PAYOS_CLIENT_ID || '').trim(),
    PAYOS_API_KEY: String(ENV.PAYOS_API_KEY || '').trim(),
    PAYOS_CHECKSUM_KEY: String(ENV.PAYOS_CHECKSUM_KEY || '').trim(),
    PAYOS_RETURN_URL: String(ENV.PAYOS_RETURN_URL || '').trim(),
    PAYOS_CANCEL_URL: String(ENV.PAYOS_CANCEL_URL || '').trim(),
    PAYOS_API_BASE: String(ENV.PAYOS_API_BASE || 'https://api-merchant.payos.vn').trim()
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
  ]
};
