const mongoose = require('mongoose');
const { env } = require('./env');

let connectionPromise = null;

async function connectDatabase() {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  if (!connectionPromise) {
    connectionPromise = mongoose.connect(env.mongoUri, {
      serverSelectionTimeoutMS: 10000
    }).catch((error) => {
      connectionPromise = null;
      throw error;
    });
  }

  await connectionPromise;
  return mongoose.connection;
}

async function checkDatabaseHealth() {
  await connectDatabase();
  await mongoose.connection.db.admin().ping();
  return { ok: true, database: 'connected' };
}

module.exports = {
  mongoose,
  connectDatabase,
  checkDatabaseHealth
};
