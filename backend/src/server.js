require('dotenv').config();
const app = require('./app');
const { testConnection } = require('./db/pool');

const port = Number(process.env.PORT || 3000);

async function start() {
  try {
    await testConnection();
    // eslint-disable-next-line no-console
    console.log('[boot] PostgreSQL connected');
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[boot] PostgreSQL connection failed:', error.message || error);
  }

  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`[boot] API is running on http://localhost:${port}`);
  });
}

start();
