const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  // Keep host-side TCP connections alive so long idle periods (nobody using
  // the terminal at night) don't leave dead sockets behind.
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
  // Fail fast if the database can't be reached instead of hanging requests.
  connectionTimeoutMillis: 15000,
  idleTimeoutMillis: 30000,
});

// CRITICAL: without this handler, an error on an idle pooled client (e.g. the
// database briefly dropping the connection overnight) crashes the whole Node
// process — every request then fails with "Failed to fetch" until the server
// happens to restart. This keeps the server alive; pg replaces the dead
// connection on the next query.
pool.on('error', (err) => {
  console.error('Unexpected Postgres connection error (server kept running):', err.message);
});

module.exports = pool;
