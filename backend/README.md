# Backend PostgreSQL API

## 1) Local setup

```bash
cd backend
cp .env.example .env
npm install
```

Fill `.env`:

- `DATABASE_URL` **or** `DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD`
- `INTERNAL_API_KEY`
- `PAYOS_CLIENT_ID`
- `PAYOS_API_KEY`
- `PAYOS_CHECKSUM_KEY`
- optional: `PAYOS_RETURN_URL`, `PAYOS_CANCEL_URL`

Run SQL schema:

```sql
\i ../sql/shce.sql
```

Start local server:

```bash
npm run dev
```

Health check:

```bash
curl http://localhost:3000/health
```

## 2) Deploy to Cloudflare Workers + Hyperdrive

### 2.1 Prerequisites

- Cloudflare account with Workers enabled
- PostgreSQL database reachable from Cloudflare
  - If DB is private/internal, use Hyperdrive private DB + Tunnel flow
  - Docs: https://developers.cloudflare.com/hyperdrive/configuration/connect-to-private-database/
- Wrangler login:

```bash
npx wrangler login
```

### 2.2 Create Hyperdrive

Create Hyperdrive from your PostgreSQL connection string:

```bash
npx wrangler hyperdrive create quanlylophoc-hd --connection-string="postgres://USER:PASSWORD@HOST:5432/DBNAME"
```

Copy returned Hyperdrive `id` and set it in `wrangler.toml`:

```toml
[[hyperdrive]]
binding = "HYPERDRIVE"
id = "YOUR_HYPERDRIVE_ID"
```

### 2.3 Configure Worker secrets / vars

Set secrets (required):

```bash
npx wrangler secret put INTERNAL_API_KEY
npx wrangler secret put PAYOS_CLIENT_ID
npx wrangler secret put PAYOS_API_KEY
npx wrangler secret put PAYOS_CHECKSUM_KEY
```

Optional secrets:

```bash
npx wrangler secret put PAYOS_RETURN_URL
npx wrangler secret put PAYOS_CANCEL_URL
```

Non-secret vars are in `wrangler.toml` (`APP_TIMEZONE`, `PAYOS_API_BASE`, `PAYMENT_CODE_PREFIX`).

### 2.4 Deploy

```bash
npm run deploy:worker
```

After deploy, you will get URL like:

```text
https://quanlylophoc-api.<subdomain>.workers.dev
```

### 2.5 Production checks

Health check:

```bash
curl https://quanlylophoc-api.<subdomain>.workers.dev/health
```

Webhook test (example):

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

## 5) Cloudflare-specific notes

- Worker runtime path is `src/worker.mjs`.
- This runtime auto-maps `env.HYPERDRIVE.connectionString` -> `process.env.DATABASE_URL`.
- Local mode (`npm run dev`) still uses `.env`.
- `pg` is pinned at `>=8.16.3` to match Hyperdrive requirement.
