import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import db from '../db.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// Get my check-ins (with optional date range)
router.get('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  const { start, end, limit } = req.query;

  let sql = 'SELECT * FROM checkins WHERE user_id = ?';
  const params: any[] = [req.user!.userId];

  if (start) {
    sql += ' AND created_at >= ?';
    params.push(start);
  }
  if (end) {
    sql += ' AND created_at <= ?';
    params.push(end);
  }
  sql += ' ORDER BY created_at DESC';

  if (limit) {
    sql += ' LIMIT ?';
    params.push(Number(limit));
  }

  const checkins = await db.prepare(sql).all(...params);
  res.json({ checkins });
});

// Create check-in
router.post('/', authenticate, async (req: Request, res: Response): Promise<void> => {
  const { exercise_type, duration, mood, weight, photo_data } = req.body;

  if (!exercise_type || !duration || !mood) {
    res.status(400).json({ error: '运动类型、时长和心情为必填项' });
    return;
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.prepare(`
    INSERT INTO checkins (id, user_id, exercise_type, duration, mood, weight, photo_data, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, req.user!.userId, exercise_type, duration, mood, weight || null, photo_data || null, now);

  const checkin = await db.prepare('SELECT * FROM checkins WHERE id = ?').get(id);
  res.status(201).json({ checkin });
});

// Delete check-in
router.delete('/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  const checkin = await db.prepare('SELECT * FROM checkins WHERE id = ? AND user_id = ?').get(req.params.id, req.user!.userId) as any;
  if (!checkin) {
    res.status(404).json({ error: '打卡记录不存在' });
    return;
  }

  await db.prepare('DELETE FROM checkins WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

export default router;
