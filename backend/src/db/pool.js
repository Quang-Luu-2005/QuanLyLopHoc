require('dotenv').config();
const mongoose = require('mongoose');

const MONGO_URI = String(process.env.MONGO_URI || '').trim();

if (!MONGO_URI) {
  console.warn('[db] Missing MONGO_URI env variable.');
}

mongoose.set('strictQuery', false);

let connectPromise = null;

function connect() {
  if (mongoose.connection.readyState >= 1) return Promise.resolve();
  if (!connectPromise) {
    connectPromise = mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000
    }).catch((err) => {
      connectPromise = null;
      throw err;
    });
  }
  return connectPromise;
}

mongoose.connection.on('error', (err) => {
  console.error('[db] MongoDB connection error:', err);
  connectPromise = null;
});

async function testConnection() {
  await connect();
  return { now: new Date() };
}

async function withTransaction(work) {
  await connect();
  if (process.env.MONGO_TRANSACTIONS_DISABLED === 'true') {
    return work(null);
  }
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}

module.exports = {
  mongoose,
  connect,
  testConnection,
  withTransaction
};
