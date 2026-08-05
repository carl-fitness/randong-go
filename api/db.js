const { Pool } = require('@neondatabase/serverless');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

let initialized = false;

async function initDB() {
  if (initialized) return;
  initialized = true;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS checkins (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      exercise_type TEXT NOT NULL,
      duration INTEGER NOT NULL,
      mood TEXT NOT NULL,
      weight REAL,
      photo_data TEXT,
      created_at TEXT NOT NULL
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS friends (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      friend_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      UNIQUE(user_id, friend_id)
    )
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_checkins_user_id ON checkins(user_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_checkins_created_at ON checkins(created_at)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_friends_user_id ON friends(user_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_friends_friend_id ON friends(friend_id)`);
}

function convertPlaceholders(query) {
  let idx = 0;
  return query.replace(/\?/g, () => `$${++idx}`);
}

const db = {
  prepare: (query) => ({
    get: async (...params) => {
      const q = convertPlaceholders(query);
      const result = await pool.query(q, params);
      return result.rows[0] ?? undefined;
    },
    all: async (...params) => {
      const q = convertPlaceholders(query);
      const result = await pool.query(q, params);
      return result.rows;
    },
    run: async (...params) => {
      const q = convertPlaceholders(query);
      await pool.query(q, params);
    },
  }),
};

module.exports = { db, initDB };
