BEGIN;

-- =========================================================
-- 1) Trigger function: tự cập nhật updated_at
-- =========================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =========================================================
-- 2) Bảng players
-- =========================================================
CREATE TABLE players (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    ingame_name VARCHAR(100) NOT NULL,
    zalo_phone VARCHAR(20),
    is_student BOOLEAN NOT NULL DEFAULT FALSE,
    highest_rank VARCHAR(50),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_players_email_not_empty
      CHECK (length(trim(email)) > 0),

    CONSTRAINT chk_players_ingame_name_not_empty
      CHECK (length(trim(ingame_name)) > 0)
);

CREATE TRIGGER trg_players_updated_at
BEFORE UPDATE ON players
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- =========================================================
-- 3) Bảng form_submissions
-- Mỗi lần submit form là 1 record
-- =========================================================
CREATE TABLE form_submissions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    player_id BIGINT NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
    submitted_at TIMESTAMPTZ NOT NULL,
    source_sheet_row INTEGER,
    source_sheet_name VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_form_submissions_source_sheet_row_positive
      CHECK (source_sheet_row IS NULL OR source_sheet_row > 0)
);

CREATE TRIGGER trg_form_submissions_updated_at
BEFORE UPDATE ON form_submissions
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- Tránh sync trùng một dòng sheet nhiều lần
ALTER TABLE form_submissions
ADD CONSTRAINT uq_form_submissions_sheet_row
UNIQUE (source_sheet_name, source_sheet_row);

-- =========================================================
-- 4) Bảng play_dates
-- Danh sách ngày thi đấu / ngày có thể tham gia
-- =========================================================
CREATE TABLE play_dates (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    play_date DATE NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =========================================================
-- 5) Bảng submission_available_dates
-- Một submission có thể chọn nhiều ngày
-- =========================================================
CREATE TABLE submission_available_dates (
    submission_id BIGINT NOT NULL REFERENCES form_submissions(id) ON DELETE CASCADE,
    play_date_id BIGINT NOT NULL REFERENCES play_dates(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (submission_id, play_date_id)
);

-- =========================================================
-- 6) Bảng payments
-- Lưu payment link và trạng thái thanh toán
-- =========================================================
CREATE TABLE payments (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    player_id BIGINT NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
    submission_id BIGINT REFERENCES form_submissions(id) ON DELETE SET NULL,
    week_key DATE NOT NULL,
    event_date DATE NOT NULL,

    order_code BIGINT NOT NULL UNIQUE,
    payment_code VARCHAR(32),
    payment_link_id VARCHAR(100) UNIQUE,
    checkout_url TEXT,
    qr_code TEXT,

    amount BIGINT NOT NULL,
    paid_amount BIGINT,
    payment_status VARCHAR(20) NOT NULL DEFAULT 'pending',
    payment_ref VARCHAR(255),
    paid_content TEXT,
    need_payment BOOLEAN NOT NULL DEFAULT TRUE,
    group_link TEXT,
    support_message TEXT,

    paid_at TIMESTAMPTZ,
    group_mail_sent_at TIMESTAMPTZ,
    last_mail_at TIMESTAMPTZ,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_payments_amount_positive
      CHECK (amount > 0),

    CONSTRAINT chk_payments_paid_amount_non_negative
      CHECK (paid_amount IS NULL OR paid_amount >= 0),

    CONSTRAINT chk_payments_status
      CHECK (payment_status IN ('pending', 'paid', 'failed', 'expired', 'cancelled')),

    CONSTRAINT uq_payments_player_week_event
      UNIQUE (player_id, week_key, event_date)
);

CREATE TRIGGER trg_payments_updated_at
BEFORE UPDATE ON payments
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- =========================================================
-- 7) Bảng payment_events
-- Lưu webhook/raw events để audit
-- =========================================================
CREATE TABLE payment_events (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    payment_id BIGINT REFERENCES payments(id) ON DELETE SET NULL,
    order_code BIGINT,
    event_type VARCHAR(50) NOT NULL,
    raw_payload JSONB NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_payment_events_event_type_not_empty
      CHECK (length(trim(event_type)) > 0)
);

-- =========================================================
-- 8) Indexes
-- =========================================================

-- players
CREATE INDEX idx_players_email ON players(email);

-- form_submissions
CREATE INDEX idx_form_submissions_player_id ON form_submissions(player_id);
CREATE INDEX idx_form_submissions_submitted_at ON form_submissions(submitted_at DESC);

-- submission_available_dates
CREATE INDEX idx_submission_available_dates_play_date_id
ON submission_available_dates(play_date_id);

-- payments
CREATE INDEX idx_payments_player_id ON payments(player_id);
CREATE INDEX idx_payments_submission_id ON payments(submission_id);
CREATE INDEX idx_payments_status ON payments(payment_status);
CREATE INDEX idx_payments_created_at ON payments(created_at DESC);
CREATE INDEX idx_payments_paid_at ON payments(paid_at DESC);
CREATE INDEX idx_payments_order_code ON payments(order_code);
CREATE INDEX idx_payments_payment_link_id ON payments(payment_link_id);
CREATE INDEX idx_payments_week_key ON payments(week_key);
CREATE INDEX idx_payments_event_date ON payments(event_date);
CREATE INDEX idx_payments_payment_code ON payments(payment_code);
CREATE INDEX idx_payments_group_mail_sent_at ON payments(group_mail_sent_at);

-- payment_events
CREATE INDEX idx_payment_events_payment_id ON payment_events(payment_id);
CREATE INDEX idx_payment_events_order_code ON payment_events(order_code);
CREATE INDEX idx_payment_events_received_at ON payment_events(received_at DESC);
CREATE INDEX idx_payment_events_event_type ON payment_events(event_type);

-- =========================================================
-- 9) Báº£ng weekly_priorities
-- LÆ°u Æ°u tiĂªn theo tuáº§n cho dashboard ghĂ©p cáº·p
-- =========================================================
CREATE TABLE weekly_priorities (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    week_key DATE NOT NULL,
    email VARCHAR(255) NOT NULL,
    priority BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_weekly_priorities_week_email UNIQUE (week_key, email)
);

CREATE TRIGGER trg_weekly_priorities_updated_at
BEFORE UPDATE ON weekly_priorities
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_weekly_priorities_week_key ON weekly_priorities(week_key);
CREATE INDEX idx_weekly_priorities_email ON weekly_priorities(email);

-- =========================================================
-- 10) Báº£ng selection_count_logs
-- Ghi nháº­n sá»‘ láº§n Ä‘Æ°á»£c chá»n Ä‘á»ƒ Ä‘áº£m báº£o cĂ´ng báº±ng
-- =========================================================
CREATE TABLE selection_count_logs (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    week_key DATE NOT NULL,
    event_date DATE NOT NULL,
    email VARCHAR(255) NOT NULL,
    name VARCHAR(100),
    ingame VARCHAR(100),
    rank VARCHAR(50),
    source VARCHAR(50),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_selection_count_week_event_email
      UNIQUE (week_key, event_date, email)
);

CREATE INDEX idx_selection_count_logs_email ON selection_count_logs(email);
CREATE INDEX idx_selection_count_logs_week_key ON selection_count_logs(week_key);
CREATE INDEX idx_selection_count_logs_event_date ON selection_count_logs(event_date);
CREATE INDEX idx_selection_count_logs_created_at ON selection_count_logs(created_at DESC);

COMMIT;
