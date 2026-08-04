import { Router, Request, Response } from 'express';
import db from '../db.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// Get all users (for admin overview)
router.get('/users', authenticate, (req: Request, res: Response): void => {
  const users = db.prepare(`
    SELECT 
      u.id, u.username, u.created_at,
      COUNT(c.id) as total_checkins,
      COALESCE(SUM(c.duration), 0) as total_duration
    FROM users u
    LEFT JOIN checkins c ON c.user_id = u.id
    GROUP BY u.id
    ORDER BY u.created_at DESC
  `).all();

  res.json({ users });
});

// Get specific user's check-ins (admin view)
router.get('/checkins/:userId', authenticate, (req: Request, res: Response): void => {
  const { userId } = req.params;

  const user = db.prepare('SELECT id, username FROM users WHERE id = ?').get(userId) as any;
  if (!user) {
    res.status(404).json({ error: '用户不存在' });
    return;
  }

  const checkins = db.prepare(`
    SELECT * FROM checkins 
    WHERE user_id = ? 
    ORDER BY created_at DESC
  `).all(userId);

  res.json({ user, checkins });
});

export default router;
