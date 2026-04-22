# Backend MongoDB API

## 1) Local setup

```bash
cd backend
cp .env.example .env
npm install
```

Fill `.env`:

- `MONGO_URI` (MongoDB Atlas or MongoDB server URI)
- `INTERNAL_API_KEY`
- `PAYOS_CLIENT_ID`
- `PAYOS_API_KEY`
- `PAYOS_CHECKSUM_KEY`
- optional: `PAYOS_RETURN_URL`, `PAYOS_CANCEL_URL`

Run connectivity test:

```bash
npm run test-db
```

Start local server:

```bash
npm run dev
```

Health check:

```bash
curl http://localhost:3000/health
```

Internal route check (must include `x-internal-api-key`):

```bash
curl -H "x-internal-api-key: <INTERNAL_API_KEY>" http://localhost:3000/internal/weeks
```

## 2) Deploy to Cloudflare Workers (MongoDB)

### 2.1 Prerequisites

- Cloudflare account with Workers enabled
- MongoDB instance reachable from Cloudflare Workers
- Wrangler login:

```bash
npx wrangler login
```

### 2.2 First deploy (create Worker)

```bash
npm run deploy:worker
```

### 2.3 Configure Worker secrets

Required:

```bash
npx wrangler secret put MONGO_URI
npx wrangler secret put INTERNAL_API_KEY
npx wrangler secret put PAYOS_CLIENT_ID
npx wrangler secret put PAYOS_API_KEY
npx wrangler secret put PAYOS_CHECKSUM_KEY
```

Optional:

```bash
npx wrangler secret put PAYOS_RETURN_URL
npx wrangler secret put PAYOS_CANCEL_URL
```

Non-secret vars are in `wrangler.toml` (`APP_TIMEZONE`, `PAYOS_API_BASE`, `PAYMENT_CODE_PREFIX`, `PORT`).

### 2.4 Deploy again after setting secrets

```bash
npm run deploy:worker
```

You will get URL like:

```text
https://quanlylophoc-api.<subdomain>.workers.dev
```

### 2.5 Production checks

```bash
curl https://quanlylophoc-api.<subdomain>.workers.dev/health
```

```bash
curl -H "x-internal-api-key: <INTERNAL_API_KEY>" \
  "https://quanlylophoc-api.<subdomain>.workers.dev/internal/weeks"
```

Webhook quick test:

```bash
curl -X POST https://quanlylophoc-api.<subdomain>.workers.dev/webhooks/payos \
  -H "Content-Type: application/json" \
  -d "{}"
```

## 3) Update Apps Script config

In `src/Env.gs`:

- `API_BASE_URL = "https://quanlylophoc-api.<subdomain>.workers.dev"`
- `INTERNAL_API_KEY = "<same value as Wrangler secret INTERNAL_API_KEY>"`

Then re-deploy Apps Script Web App and run dashboard reload.

## 4) API endpoints

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

## 5) Notes

- This backend uses MongoDB (Mongoose).
- Worker runtime file is `src/worker.mjs`.
- Worker runtime maps `env.MONGO_URI` to `process.env.MONGO_URI`.
- Optional MongoDB index bootstrap script: `sql/mongo-init.js`.
