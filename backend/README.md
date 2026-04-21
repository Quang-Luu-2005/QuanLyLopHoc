# Backend PostgreSQL + API

## 1) Setup

```bash
cd backend
cp .env.example .env
npm install
```

Fill `.env`:

- `DATABASE_URL`
- `INTERNAL_API_KEY`
- `PAYOS_CLIENT_ID`
- `PAYOS_API_KEY`
- `PAYOS_CHECKSUM_KEY`
- optional return/cancel URLs

## 2) Create database schema

Run SQL file:

```sql
\i ../sql/shce.sql
```

## 3) Start server

```bash
npm run dev
```

## 4) Endpoints

- Public
  - `GET /health`
  - `GET /api/weeks`
  - `GET /api/submissions?weekKey=YYYY-MM-DD`
  - `GET /api/players`
  - `GET /api/payments`
  - `GET /api/payments/:orderCode`

- Internal (header `x-internal-api-key`)
  - `POST /internal/sync-submission`
  - `POST /internal/sync-submissions-batch`
  - `POST /internal/save-priorities`
  - `POST /internal/increment-selection-counts`
  - `POST /internal/create-payment`
  - `POST /internal/mark-payments-paid-manual`
  - `GET /internal/payment-status-map?weekKey=...`
  - `GET /internal/ready-group-mails?cooldownMinutes=2`
  - `POST /internal/mark-mail-sent`

- Webhook
  - `POST /webhooks/payos`

## 5) Apps Script integration

Set in `src/Env.gs` (or Script Properties):

- `API_BASE_URL`
- `INTERNAL_API_KEY`
- `DEFAULT_PAYMENT_AMOUNT` (optional)

Apps Script now only:
- reads new rows from Form responses,
- syncs to backend,
- sends emails,
- reads dashboard data from backend.
