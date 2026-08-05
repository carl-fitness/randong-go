const { Router } = require('express');
const crypto = require('crypto');
const { db } = require('../db.js');
const { authenticate } = require('../middleware/auth.js');

const router = Router();

// Get my check-ins (with optional date range)
router.get('/', authenticate, async (req, res) => {
  const { start, end, limit } = req.query;
  let sql = 'SELECT * FROM checkins WHERE user_id = ?';
  const params = [req.user.userId];

  if (start) { sql += ' AND created_at >= ?'; params.push(start); }
  if (end) { sql += ' AND created_at <= ?'; params.push(end); }
  sql += ' ORDER BY created_at DESC';
  if (limit) { sql += ' LIMIT ?'; params.push(Number(limit)); }

  const checkins = await db.prepare(sql).all(...params);
  res.json({ checkins });
});

// Create check-in
router.post('/', authenticate, async (req, res) => {
  const { exercise_type, duration, mood, weight, photo_data } = req.body;

  if (!exercise_type || !duration || !mood) {
    return res.status(400).json({ error: '运动类型、时长和心情为必填项' });
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.prepare(`
    INSERT INTO checkins (id, user_id, exercise_type, duration, mood, weight, photo_data, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, req.user.userId, exercise_type, duration, mood, weight || null, photo_data || null, now);

  const checkin = await db.prepare('SELECT * FROM checkins WHERE id = ?').get(id);
  res.status(201).json({ checkin });
});

// Delete check-in
router.delete('/:id', authenticate, async (req, res) => {
  const checkin = await db.prepare('SELECT * FROM checkins WHERE id = ? AND user_id = ?').get(req.params.id, req.user.userId);
  if (!checkin) {
    return res.status(404).json({ error: '打卡记录不存在' });
  }

  await db.prepare('DELETE FROM checkins WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
