/**
 * Notification Routes — List, Count, Mark Read
 * 
 * GET  /api/notifications/list      — Paginated notifications
 * GET  /api/notifications/count     — Unread count (bell badge)
 * POST /api/notifications/mark_read — Mark single or all as read
 */

const express = require('express');
const router = express.Router();

const pool = require('../db/connection');
const { authenticateToken } = require('../middleware/auth');

router.use(authenticateToken);

// ─── GET /api/notifications/list ──────────────────────────────────
router.get('/list', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || 1, 10));
    const limit = Math.min(50, Math.max(5, parseInt(req.query.limit || 20, 10)));
    const offset = (page - 1) * limit;

    // Get total + unread counts
    const [counts] = await pool.query(
      "SELECT COUNT(*) as total, SUM(CASE WHEN is_read = 0 THEN 1 ELSE 0 END) as unread FROM customer_notifications WHERE customer_id = ?",
      [req.user.customer_id]
    );

    // Get notifications
    const [notifications] = await pool.query(
      "SELECT id, type, title, message, is_read, link, created_at FROM customer_notifications WHERE customer_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?",
      [req.user.customer_id, limit, offset]
    );

    // Cast is_read to boolean
    for (const n of notifications) {
      n.is_read = Boolean(n.is_read);
    }

    return res.json({
      success: true,
      data: {
        notifications,
        total: parseInt(counts[0]?.total || 0, 10),
        unread_count: parseInt(counts[0]?.unread || 0, 10),
        page,
        limit
      },
      message: 'Notifications loaded',
      errors: []
    });
  } catch (err) {
    console.error('Notifications list error:', err);
    return res.status(500).json({ success: false, data: null, message: 'Failed to load notifications', errors: [] });
  }
});

// ─── GET /api/notifications/count ─────────────────────────────────
router.get('/count', async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT COUNT(*) as unread_count FROM customer_notifications WHERE customer_id = ? AND is_read = 0",
      [req.user.customer_id]
    );

    return res.json({ success: true, data: { unread_count: parseInt(rows[0]?.unread_count || 0, 10) }, message: 'OK', errors: [] });
  } catch (err) {
    console.error('Notifications count error:', err);
    return res.status(500).json({ success: false, data: null, message: 'Failed to get count', errors: [] });
  }
});

// ─── POST /api/notifications/mark_read ────────────────────────────
router.post('/mark_read', async (req, res) => {
  try {
    // Mark all as read
    if (req.body.all) {
      const [result] = await pool.query(
        "UPDATE customer_notifications SET is_read = 1 WHERE customer_id = ? AND is_read = 0",
        [req.user.customer_id]
      );
      return res.json({ success: true, data: { marked: result.affectedRows }, message: `Marked ${result.affectedRows} notifications as read`, errors: [] });
    }

    // Mark single
    const notifId = parseInt(req.body.id || 0, 10);
    if (!notifId || notifId <= 0) {
      return res.status(422).json({ success: false, data: null, message: 'Notification ID is required', errors: [] });
    }

    const [result] = await pool.query(
      "UPDATE customer_notifications SET is_read = 1 WHERE id = ? AND customer_id = ?",
      [notifId, req.user.customer_id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, data: null, message: 'Notification not found', errors: [] });
    }

    return res.json({ success: true, data: { id: notifId }, message: 'Notification marked as read', errors: [] });
  } catch (err) {
    console.error('Mark read error:', err);
    return res.status(500).json({ success: false, data: null, message: 'Failed to update notification', errors: [] });
  }
});

module.exports = router;
