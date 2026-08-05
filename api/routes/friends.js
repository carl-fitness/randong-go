const { Router } = require('express');
const crypto = require('crypto');
const { db } = require('../db.js');
const { authenticate } = require('../middleware/auth.js');

const router = Router();

// Get my friends (with their recent check-ins)
router.get('/', authenticate, async (req, res) => {
  const friends = await db.prepare(`
    SELECT u.id, u.username, u.created_at as joined_at, f.id as friendship_id, f.created_at as friended_at
    FROM friends f
    JOIN users u ON f.friend_id = u.id
    WHERE f.user_id = ?
    ORDER BY f.created_at DESC
  `).all(req.user.userId);

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  
  const enriched = await Promise.all(friends.map(async (friend) => {
    const recentCheckins = await db.prepare(`
      SELECT * FROM checkins 
      WHERE user_id = ? AND created_at >= ?
      ORDER BY created_at DESC 
      LIMIT 10
    `).all(friend.id, sevenDaysAgo);
    return { ...friend, recent_checkins: recentCheckins };
  }));

  res.json({ friends: enriched });
});

// Add friend by username
router.post('/', authenticate, async (req, res) => {
  const { username } = req.body;

  if (!username) {
    return res.status(400).json({ error: '请输入好友用户名' });
  }
  if (username === req.user.username) {
    return res.status(400).json({ error: '不能添加自己为好友' });
  }

  const target = await db.prepare('SELECT id, username FROM users WHERE username = ?').get(username);
  if (!target) {
    return res.status(404).json({ error: '用户不存在' });
  }

  const existing = await db.prepare('SELECT id FROM friends WHERE user_id = ? AND friend_id = ?').get(req.user.userId, target.id);
  if (existing) {
    return res.status(409).json({ error: '已经是好友了' });
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.prepare('INSERT INTO friends (id, user_id, friend_id, created_at) VALUES (?, ?, ?, ?)').run(id, req.user.userId, target.id, now);

  res.status(201).json({ friend: { id: target.id, username: target.username } });
});

// Remove friend
router.delete('/:friendId', authenticate, async (req, res) => {
  await db.prepare('DELETE FROM friends WHERE user_id = ? AND friend_id = ?').run(req.user.userId, req.params.friendId);
  res.json({ success: true });
});

module.exports = router;
