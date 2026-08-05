const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDB } = require('./db.js');
const authRoutes = require('./routes/auth.js');
const checkinRoutes = require('./routes/checkins.js');
const friendRoutes = require('./routes/friends.js');
const adminRoutes = require('./routes/admin.js');

const app = express();

// ─── Trust proxy (required for Vercel) ─────────────────
app.set('trust proxy', 1);

// ─── Middleware ────────────────────────────────────────
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '10mb' }));

// ─── DB Init (idempotent, first request triggers) ──────
let dbReady = false;
app.use(async (_req, _res, next) => {
  if (!dbReady) {
    try {
      await initDB();
      dbReady = true;
      console.log('✅ DB initialized');
    } catch (err) {
      console.error('DB init error:', err.message);
    }
  }
  next();
});

// ─── API Routes ────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/checkins', checkinRoutes);
app.use('/api/friends', friendRoutes);
app.use('/api/admin', adminRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', dbReady, time: new Date().toISOString() });
});

// ─── Static Files (React build) ────────────────────────
const publicPath = path.join(__dirname, '..', 'public');
app.use(express.static(publicPath));

// ─── SPA fallback ──────────────────────────────────────
app.get('*', (_req, res) => {
  res.sendFile(path.join(publicPath, 'index.html'));
});

// ─── Global error handler ──────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err.message);
  res.status(500).json({ error: '服务器内部错误' });
});

module.exports = app;
