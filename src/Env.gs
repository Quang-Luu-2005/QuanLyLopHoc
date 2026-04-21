/**
 * File cấu hình key riêng (kiểu .env cho Apps Script).
 * Điền giá trị thực tế của bạn tại đây.
 */
function getEnv_() {
  return {
    MAIL_SENDER_NAME: 'Lớp học Thành Man',

    TARGET_FORM_URL: 'https://forms.gle/5PfrDPZ8A7nS3s337',
    TARGET_SPREADSHEET_ID: '1lzhf6hx1Qc95ugAk6DXL__qmI11gkbULXZEZuH6Q0X4',
    TARGET_SPREADSHEET_URL: 'https://docs.google.com/spreadsheets/d/1lzhf6hx1Qc95ugAk6DXL__qmI11gkbULXZEZuH6Q0X4/edit?usp=sharing',

    PAYMENT_STATUS_SPREADSHEET_ID: '1wyCpBgiRMNpZAuPe_2-ZZH4FfeslH-fxYLQFRAbknE8',
    PAYMENT_STATUS_SHEET_NAME: 'Payment_Status_Log',

    PAYMENT_AMOUNT: 50000,
    PAYMENT_FEE_TEXT: '50.000đ',
    PAYMENT_NOTE_TEXT: 'Bạn vui lòng chuyển khoản để nhận được link group Zalo tham gia buổi thực hành.',
    PAYMENT_TIMEOUT_HOURS: 12,
    PAYMENT_GROUP_MAIL_COOLDOWN_MINUTES: 2,

    PAYOS_CLIENT_ID: '',
    PAYOS_API_KEY: '',
    PAYOS_CHECKSUM_KEY: '',
    PAYOS_API_BASE: 'https://api-merchant.payos.vn'
  };
}
