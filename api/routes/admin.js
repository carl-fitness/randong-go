const { Router } = require('express');
const { db } = require('../db.js');
const { authenticate } = require('../middleware/auth.js');

const router = Router();

// Get all users (admin overview)
router.get('/users', authenticate, async (_req, res) => {
  const users = await db.prepare(`
    SELECT 
      u.id, u.username, u.created_at,
      COUNT(c.id) as total_checkins,
      COALESCE(SUM(c.duration), 0) as total_duration
    FROM users u
    LEFT JOIN checkins c ON c.user_id = u.id
    GROUP BY u.id, u.username, u.created_at
    ORDER BY u.created_at DESC
  `).all();

  res.json({ users });
});

// Get specific user's check-ins (admin view)
router.get('/checkins/:userId', authenticate, async (req, res) => {
  const user = await db.prepare('SELECT id, username FROM users WHERE id = ?').get(req.params.userId);
  if (!user) {
    return res.status(404).json({ error: '用户不存在' });
  }

  const checkins = await db.prepare(`
    SELECT * FROM checkins WHERE user_id = ? ORDER BY created_at DESC
  `).all(req.params.userId);

  res.json({ user, checkins });
});

module.exports = router;
