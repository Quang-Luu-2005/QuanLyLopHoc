/**
 * File cau hinh key rieng (kieu .env cho Apps Script).
 */
function getEnv_() {
  return {
    MAIL_SENDER_NAME: 'Lop hoc Thanh Man',

    TARGET_FORM_URL: 'https://forms.gle/5PfrDPZ8A7nS3s337',
    TARGET_SPREADSHEET_ID: '1lzhf6hx1Qc95ugAk6DXL__qmI11gkbULXZEZuH6Q0X4',
    TARGET_SPREADSHEET_URL: 'https://docs.google.com/spreadsheets/d/1lzhf6hx1Qc95ugAk6DXL__qmI11gkbULXZEZuH6Q0X4/edit?usp=sharing',

    API_BASE_URL: 'https://quanlylophoc-api.<subdomain>.workers.dev',
    INTERNAL_API_KEY: '',
    API_TIMEOUT_MS: 20000,

    PAYMENT_AMOUNT: 50000,
    PAYMENT_FEE_TEXT: '50.000d',
    PAYMENT_NOTE_TEXT: 'Ban vui long chuyen khoan de nhan duoc link group Zalo tham gia buoi thuc hanh.',
    PAYMENT_CODE_PREFIX: 'GE',

    FORM_SYNC_BATCH_SIZE: 50
  };
}
