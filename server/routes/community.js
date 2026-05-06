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

// ─── GET /api/community/posts ─────────────────────────────────────
router.get('/posts', async (req, res) => {
  try {
    const [posts] = await pool.query(`
      SELECT 
        p.id, p.customer_id, p.type, p.title, p.body, p.location, p.status, p.created_at,
        c.full_name as author_name, c.profile_photo as author_photo,
        (SELECT COUNT(*) FROM community_comments cc WHERE cc.post_id = p.id AND cc.is_approved = 1) as comment_count
      FROM community_posts p
      JOIN customers c ON p.customer_id = c.id
      WHERE p.is_approved = 1 AND p.status != 'hidden'
      ORDER BY 
        CASE WHEN p.type = 'sos' AND p.status = 'open' THEN 1 ELSE 2 END,
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
    let isApproved = 1;

    // AI Moderation for all posts
    const isSafe = await straicoService.moderateContent(title, body);
    if (!isSafe) {
      // Shadowban the post if it fails AI moderation
      isApproved = 0;
    }

    const [result] = await pool.query(`
      INSERT INTO community_posts (customer_id, type, title, body, location, status, is_approved)
      VALUES (?, ?, ?, ?, ?, 'open', ?)
    `, [customerId, postType, title, body, location || null, isApproved]);

    const newPostId = result.insertId;

    if (isApproved === 0) {
      // If shadowbanned, we still return success so the spammer doesn't know
      return res.json({ 
        success: true, 
        data: { id: newPostId, status: 'open' }, 
        message: 'Post submitted successfully', 
        errors: [] 
      });
    }

    const [newPost] = await pool.query(`
      SELECT p.*, c.full_name as author_name 
      FROM community_posts p
      JOIN customers c ON p.customer_id = c.id
      WHERE p.id = ?
    `, [newPostId]);

    return res.json({ success: true, data: { post: newPost[0] }, message: 'Post created successfully', errors: [] });
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

    if (!post_id || !body) {
      return res.status(422).json({ success: false, message: 'Post ID and body are required', errors: [] });
    }

    // Check if the user is a tech. 
    // We check if the customer's phone number exists in the users table.
    let isTech = 0;
    try {
      const [customerRecord] = await pool.query("SELECT mobile FROM customers WHERE id = ?", [customerId]);
      if (customerRecord.length > 0 && customerRecord[0].mobile) {
        const mobile = customerRecord[0].mobile;
        // Last 10 digits comparison logic (naive approach for this check)
        const last10 = mobile.slice(-10);
        const [userRecord] = await pool.query("SELECT id FROM users WHERE phone LIKE ?", [`%${last10}`]);
        if (userRecord.length > 0) {
          isTech = 1;
        }
      }
    } catch (e) {
      console.warn('Failed to check if user is tech', e);
    }

    // Moderation for comments (optional, we use same straico service)
    const isSafe = await straicoService.moderateContent("Comment", body);
    const isApproved = isSafe ? 1 : 0;

    const [result] = await pool.query(`
      INSERT INTO community_comments (post_id, customer_id, is_tech, body, is_approved)
      VALUES (?, ?, ?, ?, ?)
    `, [post_id, customerId, isTech, body, isApproved]);

    if (isApproved === 0) {
      return res.json({ success: true, message: 'Comment submitted successfully', errors: [] });
    }

    const [newComment] = await pool.query(`
      SELECT cc.*, c.full_name as author_name, c.profile_photo as author_photo
      FROM community_comments cc
      JOIN customers c ON cc.customer_id = c.id
      WHERE cc.id = ?
    `, [result.insertId]);

    return res.json({ success: true, data: { comment: newComment[0] }, message: 'Comment added', errors: [] });
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
