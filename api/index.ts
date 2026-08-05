// Vercel serverless entry point
// All requests are routed here; Express handles API + static + SPA fallback
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDB } from '../server/src/db.js';
import authRoutes from '../server/src/routes/auth.js';
import checkinRoutes from '../server/src/routes/checkins.js';
import friendRoutes from '../server/src/routes/friends.js';
import adminRoutes from '../server/src/routes/admin.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// ─── Middleware ────────────────────────────────────────
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '10mb' }));

// ─── DB Init ───────────────────────────────────────────
// Initialize tables on first request
let dbReady = false;
app.use(async (_req, _res, next) => {
  if (!dbReady) {
    await initDB();
    dbReady = true;
  }
  next();
});

// ─── API Routes ────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/checkins', checkinRoutes);
app.use('/api/friends', friendRoutes);
app.use('/api/admin', adminRoutes);
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// ─── Static Files (React build) ────────────────────────
const distPath = path.join(__dirname, '..', 'dist-build');
app.use(express.static(distPath));
app.get('*', (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

export default app;
