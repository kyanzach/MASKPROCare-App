/**
 * Community Rescue Routes
 * 
 * GET  /api/community/posts       — List approved posts and SOS
 * POST /api/community/posts       — Create a new post/SOS (AI gated)
 * GET  /api/community/posts/:id/comments — Get comments for a post
 * POST /api/community/comments    — Add a comment to a post
 * PUT  /api/community/posts/:id/resolve — Mark an SOS as resolved
 */

const express = require('express');
const router = express.Router();
const pool = require('../db/connection');
const { authenticateToken } = require('../middleware/auth');
const straicoService = require('../services/straico');

router.use(authenticateToken);

// ─── Helper: Get all active Care app customer IDs for urgent S.O.S. broadcasts ──
async function getActiveCareCustomerIds() {
  try {
    const [rows] = await pool.query(`
      SELECT DISTINCT cid FROM (
        SELECT customer_id AS cid FROM care_app_telemetry WHERE customer_id > 0
        UNION
        SELECT customer_id AS cid FROM care_magic_links WHERE customer_id > 0
        UNION
        SELECT customer_id AS cid FROM customer_notifications WHERE customer_id > 0
        UNION
        SELECT customer_id AS cid FROM community_posts WHERE customer_id > 0
        UNION
        SELECT c.id AS cid FROM customers c
        JOIN login_otp l ON RIGHT(REPLACE(c.mobile_number, ' ', ''), 10) = RIGHT(REPLACE(l.mobile, ' ', ''), 10)
        UNION
        SELECT c.id AS cid FROM customers c
        JOIN users u ON TRIM(u.full_name) = TRIM(c.full_name) OR (u.mobile_number != '' AND u.mobile_number = c.mobile_number)
        WHERE u.access_level = 'admin'
      ) active_users
      WHERE cid IS NOT NULL AND cid > 0
    `);
    return rows.map((r) => Number(r.cid)).filter(Boolean);
  } catch (err) {
    console.warn('[Community] Failed to query active care customer IDs:', err.message);
    return [];
  }
}

// ─── Helper: Get admin customer IDs for moderation alerts ─────────
async function getAdminCustomerIds() {
  try {
    const [rows] = await pool.query(`
      SELECT DISTINCT c.id AS cid
      FROM customers c
      JOIN users u ON TRIM(u.full_name) = TRIM(c.full_name) OR (u.mobile_number != '' AND u.mobile_number = c.mobile_number)
      WHERE u.access_level = 'admin'
    `);
    return rows.map((r) => Number(r.cid)).filter(Boolean);
  } catch (err) {
    return [];
  }
}

// ─── GET /api/community/posts ─────────────────────────────────────
// Facebook-Group style feed:
// 1. Open MASKPRO S.O.S. emergencies pinned first
// 2. Approved posts ranked by Facebook Group EdgeRank-style engagement & recency decay
// (Pending posts are held exclusively in Admin Moderation until approved)
router.get('/posts', async (req, res) => {
  try {
    const [posts] = await pool.query(`
      SELECT 
        p.id, p.customer_id, p.type, p.title, p.body, p.location, p.status,
        p.is_approved, p.moderation_status, p.created_at,
        c.full_name as author_name, c.profile_photo as author_photo,
        (SELECT COUNT(*) FROM community_comments cc WHERE cc.post_id = p.id AND cc.is_approved = 1) as comment_count,
        (SELECT COUNT(*) FROM community_comments cc2 WHERE cc2.post_id = p.id AND cc2.is_approved = 1 AND cc2.is_tech = 1) as tech_comment_count
      FROM community_posts p
      JOIN customers c ON p.customer_id = c.id
      WHERE p.is_approved = 1 AND p.status != 'hidden' AND p.moderation_status = 'approved'
      ORDER BY 
        CASE 
          WHEN p.type = 'sos' AND p.status = 'open' THEN 0
          ELSE 1
        END ASC,
        (
          (SELECT COUNT(*) FROM community_comments cc WHERE cc.post_id = p.id AND cc.is_approved = 1) * 5 +
          (SELECT COUNT(*) FROM community_comments cc2 WHERE cc2.post_id = p.id AND cc2.is_approved = 1 AND cc2.is_tech = 1) * 8 +
          10
        ) / POW(GREATEST(TIMESTAMPDIFF(HOUR, p.created_at, NOW()), 0) + 2, 1.4) DESC,
        p.created_at DESC
      LIMIT 50
    `);

    return res.json({ success: true, data: { posts }, message: 'Posts retrieved', errors: [] });
  } catch (err) {
    console.error('Community get posts error:', err);
    return res.status(500).json({ success: false, data: null, message: 'Failed to fetch posts', errors: [] });
  }
});

// ─── POST /api/community/posts ────────────────────────────────────
router.post('/posts', async (req, res) => {
  try {
    const customerId = req.user.customer_id;
    const { type, title, body, location } = req.body;

    if (!title || !body) {
      return res.status(422).json({ success: false, message: 'Title and body are required', errors: [] });
    }

    const postType = type === 'sos' ? 'sos' : 'discussion';

    // AI safety check for spam/profanity
    const isSafe = await straicoService.moderateContent(title, body);

    // Facebook-Group style moderation:
    // - MASKPRO S.O.S. emergencies go live immediately (if AI-safe) and trigger instant Bell + Push notifications
    // - Maintenance Discussions require Admin Approval ('pending', is_approved = 0)
    let isApproved = 1;
    let moderationStatus = 'approved';

    if (!isSafe) {
      isApproved = 0;
      moderationStatus = 'rejected';
    } else if (postType === 'discussion') {
      isApproved = 0;
      moderationStatus = 'pending';
    }

    const [result] = await pool.query(`
      INSERT INTO community_posts (customer_id, type, title, body, location, status, is_approved, moderation_status)
      VALUES (?, ?, ?, ?, ?, 'open', ?, ?)
    `, [customerId, postType, title.trim(), body.trim(), location ? location.trim() : null, isApproved, moderationStatus]);

    const newPostId = result.insertId;

    if (!isSafe) {
      return res.json({ 
        success: true, 
        data: { id: newPostId, status: 'open', moderation_status: 'pending' }, 
        message: 'Post submitted for review', 
        errors: [] 
      });
    }

    const [newPost] = await pool.query(`
      SELECT p.*, c.full_name as author_name, c.profile_photo as author_photo,
        0 as comment_count, 0 as tech_comment_count
      FROM community_posts p
      JOIN customers c ON p.customer_id = c.id
      WHERE p.id = ?
    `, [newPostId]);

    const createdPost = newPost[0];
    const authorName = createdPost?.author_name || 'A MaskPro Member';

    if (postType === 'sos') {
      // Broadcast urgent S.O.S. alert to all active Care app users (Bell + Push Notification)
      try {
        const recipientIds = await getActiveCareCustomerIds();
        if (!recipientIds.includes(customerId)) recipientIds.push(customerId);

        const locSuffix = location ? ` near ${location.trim()}` : '';
        const notifTitle = `MASKPRO S.O.S.: ${title.trim()}`;
        const notifMsg = `${authorName} needs emergency roadside help${locSuffix}: "${body.trim().slice(0, 120)}" — Tap to respond immediately.`;

        if (recipientIds.length > 0) {
          const values = recipientIds.map((cid) => [cid, 'community_sos', notifTitle, notifMsg, '/community-care']);
          await pool.query(
            `INSERT INTO customer_notifications (customer_id, type, title, message, link) VALUES ?`,
            [values]
          );
        }

        // Also notify Unify branch staff & admins
        const [staffUsers] = await pool.query(
          `SELECT id FROM users WHERE status = 'active' AND access_level IN ('admin', 'branch')`
        );
        if (staffUsers.length > 0) {
          const staffValues = staffUsers.map((u) => [
            u.id,
            'community_sos',
            notifTitle,
            notifMsg,
            'bookings_list.php'
          ]);
          await pool.query(
            `INSERT INTO notifications (user_id, type, title, message, link) VALUES ?`,
            [staffValues]
          ).catch(() => {});
        }
      } catch (notifErr) {
        console.warn('[Community] Failed to broadcast S.O.S. notifications:', notifErr.message);
      }

      return res.json({
        success: true,
        data: { post: createdPost, moderation_status: 'approved' },
        message: 'MASKPRO S.O.S. broadcast live! Community members and technicians have been notified.',
        errors: []
      });
    } else {
      // Maintenance Discussion -> Held in Admin Moderation queue (no push notification sent while pending)
      return res.json({
        success: true,
        data: { post: createdPost, moderation_status: 'pending' },
        message: 'Your discussion post has been submitted and is pending admin approval.',
        errors: []
      });
    }
  } catch (err) {
    console.error('Community create post error:', err);
    return res.status(500).json({ success: false, message: 'Failed to create post', errors: [] });
  }
});

// ─── GET /api/community/posts/:id/comments ────────────────────────
router.get('/posts/:id/comments', async (req, res) => {
  try {
    const postId = req.params.id;
    const [comments] = await pool.query(`
      SELECT 
        cc.id, cc.post_id, cc.customer_id, cc.is_tech, cc.body, cc.created_at,
        c.full_name as author_name, c.profile_photo as author_photo
      FROM community_comments cc
      JOIN customers c ON cc.customer_id = c.id
      WHERE cc.post_id = ? AND cc.is_approved = 1
      ORDER BY cc.created_at ASC
    `, [postId]);

    return res.json({ success: true, data: { comments }, message: 'Comments retrieved', errors: [] });
  } catch (err) {
    console.error('Community get comments error:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch comments', errors: [] });
  }
});

// ─── POST /api/community/comments ─────────────────────────────────
router.post('/comments', async (req, res) => {
  try {
    const customerId = req.user.customer_id;
    const { post_id, body } = req.body;

    if (!post_id || !body || !String(body).trim()) {
      return res.status(422).json({ success: false, message: 'Post ID and comment body are required', errors: [] });
    }

    // Check if the user is a MaskPro technician/staff in the Unify users table
    let isTech = 0;
    try {
      const [customerRecord] = await pool.query("SELECT full_name, mobile_number FROM customers WHERE id = ?", [customerId]);
      if (customerRecord.length > 0) {
        const mobile = String(customerRecord[0].mobile_number || '').replace(/\D/g, '');
        const last10 = mobile.slice(-10);
        const fullName = String(customerRecord[0].full_name || '').trim();
        const [userRecord] = await pool.query(
          "SELECT id FROM users WHERE (mobile_number != '' AND RIGHT(REPLACE(mobile_number, ' ', ''), 10) = ?) OR TRIM(full_name) = ? LIMIT 1",
          [last10 || '___none___', fullName]
        );
        if (userRecord.length > 0) {
          isTech = 1;
        }
      }
    } catch (e) {
      console.warn('Failed to check if user is tech:', e.message);
    }

    // Moderation for comments
    const isSafe = await straicoService.moderateContent("Comment", body);
    const isApproved = isSafe ? 1 : 0;

    const [result] = await pool.query(`
      INSERT INTO community_comments (post_id, customer_id, is_tech, body, is_approved)
      VALUES (?, ?, ?, ?, ?)
    `, [post_id, customerId, isTech, String(body).trim(), isApproved]);

    if (isApproved === 0) {
      return res.json({ success: true, message: 'Comment submitted successfully', errors: [] });
    }

    const [newComment] = await pool.query(`
      SELECT cc.*, c.full_name as author_name, c.profile_photo as author_photo
      FROM community_comments cc
      JOIN customers c ON cc.customer_id = c.id
      WHERE cc.id = ?
    `, [result.insertId]);

    const commentObj = newComment[0];
    const commenterName = commentObj?.author_name || 'A MaskPro Member';

    // Fetch parent post details to trigger instant notifications
    try {
      const [postRows] = await pool.query(
        `SELECT id, customer_id, type, title, location FROM community_posts WHERE id = ? LIMIT 1`,
        [post_id]
      );
      if (postRows.length > 0) {
        const parentPost = postRows[0];
        if (parentPost.type === 'sos') {
          // Time is of the essence for MASKPRO S.O.S. comments:
          // Broadcast to all active Care users (Notification Bell + Push Notifications)
          const recipientIds = await getActiveCareCustomerIds();
          if (!recipientIds.includes(Number(parentPost.customer_id))) {
            recipientIds.push(Number(parentPost.customer_id));
          }
          if (!recipientIds.includes(Number(customerId))) {
            recipientIds.push(Number(customerId));
          }

          const notifTitle = `New S.O.S. Comment: ${parentPost.title}`;
          const rolePrefix = isTech ? `${commenterName} (MaskPro Tech)` : commenterName;
          const notifMsg = `${rolePrefix} commented: "${String(body).trim().slice(0, 120)}"`;

          if (recipientIds.length > 0) {
            const values = recipientIds.map((cid) => [cid, 'community_sos_comment', notifTitle, notifMsg, '/community-care']);
            await pool.query(
              `INSERT INTO customer_notifications (customer_id, type, title, message, link) VALUES ?`,
              [values]
            );
          }
        } else {
          // Regular discussion comment: notify post author and previous commenters
          const [prevCommenters] = await pool.query(
            `SELECT DISTINCT customer_id FROM community_comments WHERE post_id = ? AND is_approved = 1`,
            [post_id]
          );
          const notifySet = new Set([Number(parentPost.customer_id)]);
          prevCommenters.forEach((r) => notifySet.add(Number(r.customer_id)));
          notifySet.delete(Number(customerId)); // don't notify self on regular discussion

          const targetIds = Array.from(notifySet).filter((id) => id > 0);
          if (targetIds.length > 0) {
            const notifTitle = `New Reply on "${parentPost.title}"`;
            const notifMsg = `${commenterName}: "${String(body).trim().slice(0, 120)}"`;
            const values = targetIds.map((cid) => [cid, 'community_comment', notifTitle, notifMsg, '/community-care']);
            await pool.query(
              `INSERT INTO customer_notifications (customer_id, type, title, message, link) VALUES ?`,
              [values]
            );
          }
        }
      }
    } catch (notifErr) {
      console.warn('[Community] Failed to send comment notifications:', notifErr.message);
    }

    return res.json({ success: true, data: { comment: commentObj }, message: 'Comment added', errors: [] });
  } catch (err) {
    console.error('Community create comment error:', err);
    return res.status(500).json({ success: false, message: 'Failed to add comment', errors: [] });
  }
});

// ─── PUT /api/community/posts/:id/resolve ─────────────────────────
router.put('/posts/:id/resolve', async (req, res) => {
  try {
    const customerId = req.user.customer_id;
    const postId = req.params.id;

    // Ensure the post belongs to the user
    const [posts] = await pool.query("SELECT * FROM community_posts WHERE id = ? AND customer_id = ?", [postId, customerId]);
    if (posts.length === 0) {
      return res.status(403).json({ success: false, message: 'Unauthorized or post not found', errors: [] });
    }

    await pool.query("UPDATE community_posts SET status = 'resolved' WHERE id = ?", [postId]);

    return res.json({ success: true, message: 'Post marked as resolved', errors: [] });
  } catch (err) {
    console.error('Community resolve post error:', err);
    return res.status(500).json({ success: false, message: 'Failed to resolve post', errors: [] });
  }
});

module.exports = router;
