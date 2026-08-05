import { sql } from '@vercel/postgres';

// ─── Query wrapper (mimics better-sqlite3 API, async) ────────

/**
 * Convert SQLite ? placeholders to PostgreSQL $1, $2, ...
 */
function convertPlaceholders(query: string): string {
  let idx = 0;
  return query.replace(/\?/g, () => `$${++idx}`);
}

export const db = {
  prepare: (query: string) => ({
    get: async (...params: any[]) => {
      const q = convertPlaceholders(query);
      const result = await sql.query(q, params);
      return result.rows[0] ?? undefined;
    },
    all: async (...params: any[]) => {
      const q = convertPlaceholders(query);
      const result = await sql.query(q, params);
      return result.rows;
    },
    run: async (...params: any[]) => {
      const q = convertPlaceholders(query);
      await sql.query(q, params);
    },
  }),
};

// ─── Schema ────────────────────────────────────────────

let initialized = false;

export async function initDB(): Promise<void> {
  if (initialized) return;
  initialized = true;

  await sql.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  await sql.query(`
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

  await sql.query(`
    CREATE TABLE IF NOT EXISTS friends (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      friend_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      UNIQUE(user_id, friend_id)
    )
  `);

  // Create indexes (IF NOT EXISTS is PG 9.5+)
  await sql.query(`CREATE INDEX IF NOT EXISTS idx_checkins_user_id ON checkins(user_id)`);
  await sql.query(`CREATE INDEX IF NOT EXISTS idx_checkins_created_at ON checkins(created_at)`);
  await sql.query(`CREATE INDEX IF NOT EXISTS idx_friends_user_id ON friends(user_id)`);
  await sql.query(`CREATE INDEX IF NOT EXISTS idx_friends_friend_id ON friends(friend_id)`);
}

export default db;
