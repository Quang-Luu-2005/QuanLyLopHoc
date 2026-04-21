require('dotenv').config();
const { Pool } = require('pg');

function toIntSafe(value, fallback) {
  const num = Number(value);
  if (!num || Number.isNaN(num) || num < 0) {
    return fallback;
  }
  return Math.floor(num);
}

function buildPoolConfigFromEnv() {
  const connectionString = String(process.env.DATABASE_URL || process.env.HYPERDRIVE_CONNECTION_STRING || '').trim();
  if (connectionString) {
    return {
      connectionString,
      max: toIntSafe(process.env.PG_POOL_MAX, 8),
      idleTimeoutMillis: toIntSafe(process.env.PG_IDLE_TIMEOUT_MS, 10000),
      connectionTimeoutMillis: toIntSafe(process.env.PG_CONN_TIMEOUT_MS, 10000)
    };
  }

  const host = String(process.env.DB_HOST || '').trim();
  const database = String(process.env.DB_NAME || '').trim();
  const user = String(process.env.DB_USER || '').trim();
  const password = String(process.env.DB_PASSWORD || '');
  const port = toIntSafe(process.env.DB_PORT, 5432);

  if (!host || !database || !user) {
    return null;
  }

  return {
    host,
    port,
    database,
    user,
    password,
    max: toIntSafe(process.env.PG_POOL_MAX, 8),
    idleTimeoutMillis: toIntSafe(process.env.PG_IDLE_TIMEOUT_MS, 10000),
    connectionTimeoutMillis: toIntSafe(process.env.PG_CONN_TIMEOUT_MS, 10000)
  };
}

const basePoolConfig = buildPoolConfigFromEnv();

if (!basePoolConfig) {
  // Keep process alive for local lint/compile, but runtime requests will fail fast when query executes.
  // eslint-disable-next-line no-console
  console.warn('[db] Missing PostgreSQL env config (DATABASE_URL/HYPERDRIVE_CONNECTION_STRING or DB_HOST/DB_PORT/DB_NAME/DB_USER).');
}

const pool = new Pool(
  Object.assign(
    {},
    basePoolConfig || {},
    { ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined }
  )
);

pool.on('error', (err) => {
  // eslint-disable-next-line no-console
  console.error('[db] Unexpected pool error:', err);
});

async function testConnection() {
  const result = await pool.query('SELECT NOW() AS now');
  return result.rows[0];
}

async function withTransaction(work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  pool,
  query: (text, params) => pool.query(text, params),
  withTransaction,
  testConnection
};
