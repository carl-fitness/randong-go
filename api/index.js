module.exports = function handler(req, res) {
  try {
    return res.json({ status: 'ok', time: new Date().toISOString() });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
};