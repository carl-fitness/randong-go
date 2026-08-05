import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const JWT_SECRET = process.env.JWT_SECRET || 'randong-go-secret-key-2026';

// ── Auth helper ──────────────────────────────────────────
function auth(req: VercelRequest) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET) as { id: number; username: string; isAdmin: boolean };
  } catch { return null; }
}

// ── DB init (runs once globally) ─────────────────────────
let dbInitPromise: Promise<void> | null = null;
async function initDB() {
  if (dbInitPromise) return dbInitPromise;
  dbInitPromise = (async () => {
    const client = await pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          username VARCHAR(50) UNIQUE NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          display_name VARCHAR(100),
          avatar_url TEXT,
          is_admin BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS checkins (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          date VARCHAR(10) NOT NULL,
          exercise_type VARCHAR(50),
          duration INTEGER,
          notes TEXT,
          weight NUMERIC(5,2),
          photo_url TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS friends (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          friend_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          status VARCHAR(20) DEFAULT 'pending',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(user_id, friend_id)
        )
      `);
      const adminExists = await client.query("SELECT 1 FROM users WHERE username='admin'");
      if (adminExists.rowCount === 0) {
        await client.query(
          "INSERT INTO users (username, password_hash, display_name, is_admin) VALUES ($1,$2,$3,$4)",
          ['admin', await bcrypt.hash('admin123', 10), '管理员', true]
        );
      }
    } finally { client.release(); }
  })();
  return dbInitPromise;
}

// ── Handler ──────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const url = req.url || '/';
  const method = req.method || 'GET';
  const body = req.body || {};

  // Health check (no DB needed)
  if (url === '/api/health' || url === '/health') {
    return res.json({ status: 'ok', time: new Date().toISOString() });
  }

  // Init DB before API calls
  try {
    await initDB();
  } catch (e: any) {
    console.error('DB init failed:', e.message);
    return res.status(500).json({ error: 'Database initialization failed', detail: e.message });
  }

  // Auth routes
  if (url === '/api/auth/register' && method === 'POST') {
    const { username, password, displayName } = body;
    if (!username || !password) return res.status(400).json({ error: '缺少用户名或密码' });
    const hash = await bcrypt.hash(password, 10);
    try {
      const r = await pool.query(
        'INSERT INTO users (username, password_hash, display_name) VALUES ($1,$2,$3) RETURNING id, username, display_name',
        [username, hash, displayName || username]
      );
      return res.json({ id: r.rows[0].id, username: r.rows[0].username, displayName: r.rows[0].display_name });
    } catch (e: any) {
      if (e.code === '23505') return res.status(409).json({ error: '用户名已存在' });
      throw e;
    }
  }

  if (url === '/api/auth/login' && method === 'POST') {
    const { username, password } = body;
    const r = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (!r.rows[0]) return res.status(401).json({ error: '用户名或密码错误' });
    const ok = await bcrypt.compare(password, r.rows[0].password_hash);
    if (!ok) return res.status(401).json({ error: '用户名或密码错误' });
    const token = jwt.sign({ id: r.rows[0].id, username: r.rows[0].username, isAdmin: r.rows[0].is_admin }, JWT_SECRET, { expiresIn: '30d' });
    return res.json({ token, user: { id: r.rows[0].id, username: r.rows[0].username, displayName: r.rows[0].display_name, isAdmin: r.rows[0].is_admin } });
  }

  if (url === '/api/auth/me' && method === 'GET') {
    const u = auth(req);
    if (!u) return res.status(401).json({ error: '未登录' });
    const r = await pool.query('SELECT id, username, display_name, avatar_url, is_admin FROM users WHERE id = $1', [u.id]);
    return res.json(r.rows[0]);
  }

  // Checkins
  if (url === '/api/checkins' && method === 'GET') {
    const u = auth(req);
    if (!u) return res.status(401).json({ error: '未登录' });
    const r = await pool.query('SELECT * FROM checkins WHERE user_id = $1 ORDER BY date DESC', [u.id]);
    return res.json(r.rows);
  }
  if (url === '/api/checkins' && method === 'POST') {
    const u = auth(req);
    if (!u) return res.status(401).json({ error: '未登录' });
    const { date, exerciseType, duration, notes, weight, photoUrl } = body;
    const r = await pool.query(
      'INSERT INTO checkins (user_id, date, exercise_type, duration, notes, weight, photo_url) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [u.id, date, exerciseType, duration, notes, weight, photoUrl]
    );
    return res.json(r.rows[0]);
  }
  if (url.startsWith('/api/checkins/') && method === 'DELETE') {
    const u = auth(req);
    if (!u) return res.status(401).json({ error: '未登录' });
    const id = parseInt(url.split('/')[3]);
    await pool.query('DELETE FROM checkins WHERE id = $1 AND user_id = $2', [id, u.id]);
    return res.json({ success: true });
  }

  // Friends
  if (url === '/api/friends' && method === 'GET') {
    const u = auth(req);
    if (!u) return res.status(401).json({ error: '未登录' });
    const r = await pool.query(`
      SELECT u.id, u.username, u.display_name, u.avatar_url, f.status
      FROM friends f
      JOIN users u ON (f.friend_id = u.id AND f.user_id = $1) OR (f.user_id = u.id AND f.friend_id = $1)
      WHERE u.id != $1
    `, [u.id]);
    return res.json(r.rows);
  }
  if (url === '/api/friends' && method === 'POST') {
    const u = auth(req);
    if (!u) return res.status(401).json({ error: '未登录' });
    const { friendUsername } = body;
    const fr = await pool.query('SELECT id FROM users WHERE username = $1', [friendUsername]);
    if (!fr.rows[0]) return res.status(404).json({ error: '用户不存在' });
    const fid = fr.rows[0].id;
    if (fid === u.id) return res.status(400).json({ error: '不能添加自己' });
    await pool.query('INSERT INTO friends (user_id, friend_id, status) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [u.id, fid, 'accepted']);
    return res.json({ success: true });
  }

  // Admin
  if (url === '/api/admin/summary' && method === 'GET') {
    const u = auth(req);
    if (!u?.isAdmin) return res.status(403).json({ error: '无权限' });
    const uc = await pool.query('SELECT COUNT(*) FROM users');
    const cc = await pool.query('SELECT COUNT(*) FROM checkins');
    const wc = await pool.query('SELECT COUNT(*) FROM checkins WHERE weight IS NOT NULL');
    return res.json({ totalUsers: parseInt(uc.rows[0].count), totalCheckins: parseInt(cc.rows[0].count), totalWeightRecords: parseInt(wc.rows[0].count) });
  }
  if (url === '/api/admin/users' && method === 'GET') {
    const u = auth(req);
    if (!u?.isAdmin) return res.status(403).json({ error: '无权限' });
    const r = await pool.query('SELECT id, username, display_name, created_at FROM users ORDER BY created_at DESC');
    return res.json(r.rows);
  }
  if (url === '/api/admin/checkins' && method === 'GET') {
    const u = auth(req);
    if (!u?.isAdmin) return res.status(403).json({ error: '无权限' });
    const r = await pool.query('SELECT c.*, u.username FROM checkins c JOIN users u ON c.user_id = u.id ORDER BY c.created_at DESC');
    return res.json(r.rows);
  }

  return res.status(404).json({ error: 'Not found' });
}
