require('dotenv').config();
const app = require('./app');
const { testConnection } = require('./db/pool');

const port = Number(process.env.PORT || 3000);

async function start() {
  try {
    await testConnection();
    console.log('[boot] MongoDB connected');
  } catch (error) {
    console.error('[boot] MongoDB connection failed:', error.message || error);
  }

  app.listen(port, () => {
    console.log(`[boot] API is running on http://localhost:${port}`);
  });
}

start();
