/**
 * Admin Routes — Customer list + impersonation
 * 
 * GET  /api/admin/customers       — List customers (paginated, searchable)
 * POST /api/admin/impersonate     — Generate JWT for a target customer
 * GET  /api/admin/check           — Check if current user is admin
 * 
 * Auth: user must have access_level = 'admin' in the Unify `users` table
 *       matched by mobile_number
 */

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const pool = require('../db/connection');
const { authenticateToken, JWT_SECRET } = require('../middleware/auth');

// ─── Helper: check if customer is admin ─────────────────────
async function isAdminUser(customerId, mobile) {
  // Method 1: Direct mobile match in users table
  if (mobile) {
    const [byMobile] = await pool.query(
      "SELECT id, full_name, access_level FROM users WHERE mobile_number = ? AND access_level = 'admin' LIMIT 1",
      [mobile]
    );
    if (byMobile.length > 0) return byMobile[0];
  }

  // Method 2: Cross-reference by customer full_name → users full_name
  // (handles case where admin has different phone in users vs customers table)
  if (customerId) {
    const [byName] = await pool.query(
      `SELECT u.id, u.full_name, u.access_level
       FROM users u
       JOIN customers c ON TRIM(u.full_name) = TRIM(c.full_name)
       WHERE c.id = ? AND u.access_level = 'admin'
       LIMIT 1`,
      [customerId]
    );
    if (byName.length > 0) return byName[0];
  }

  return null;
}

// ─── Admin check middleware ──────────────────────────────────
async function requireAdmin(req, res, next) {
  try {
    const admin = await isAdminUser(req.user.customer_id, req.user.mobile);
    if (!admin) {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }
    req.adminUser = admin;
    next();
  } catch (err) {
    console.error('[Admin] Auth check error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
}

// ─── GET /api/admin/check ────────────────────────────────────
// Quick check if the logged-in user is an admin
router.get('/check', authenticateToken, async (req, res) => {
  try {
    const admin = await isAdminUser(req.user.customer_id, req.user.mobile);
    return res.json({
      success: true,
      data: { isAdmin: !!admin, adminName: admin?.full_name || null },
    });
  } catch (err) {
    return res.json({ success: true, data: { isAdmin: false } });
  }
});

// ─── GET /api/admin/customers ────────────────────────────────
router.get('/customers', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const search = req.query.search || '';
    const offset = (page - 1) * limit;

    let whereClause = '';
    let params = [];
    if (search.trim()) {
      whereClause = 'WHERE c.full_name LIKE ? OR c.mobile_number LIKE ?';
      params = [`%${search}%`, `%${search}%`];
    }

    // Count total
    const [countResult] = await pool.query(
      `SELECT COUNT(*) as total FROM customers c ${whereClause}`,
      params
    );
    const total = countResult[0].total;

    // Get customers with booking count
    const [customers] = await pool.query(
      `SELECT c.id, c.full_name, c.mobile_number, c.email, c.branch_id,
              (SELECT COUNT(*) FROM bookings b WHERE b.customer_id = c.id) as booking_count
       FROM customers c
       ${whereClause}
       ORDER BY c.full_name ASC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    return res.json({
      success: true,
      data: {
        customers,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      },
    });
  } catch (err) {
    console.error('[Admin] Customer list error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch customers' });
  }
});

// ─── POST /api/admin/impersonate ─────────────────────────────
router.post('/impersonate', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { customer_id } = req.body;
    if (!customer_id) {
      return res.status(400).json({ success: false, message: 'customer_id is required' });
    }

    // Get the target customer
    const [customers] = await pool.query(
      'SELECT id, full_name, mobile_number, branch_id, profile_photo FROM customers WHERE id = ?',
      [customer_id]
    );

    if (customers.length === 0) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    const target = customers[0];

    // Generate JWT for the target customer (same structure as normal login)
    const token = jwt.sign(
      {
        iss: 'maskpro-care-api',
        sub: target.id,
        mobile: target.mobile_number,
        branch_id: target.branch_id || 1,
        impersonated_by: req.adminUser.id,
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    console.log(`[Admin] ${req.adminUser.full_name} impersonating customer ${target.full_name} (ID: ${target.id})`);

    return res.json({
      success: true,
      data: {
        token,
        customer: {
          id: target.id,
          full_name: target.full_name,
          mobile_number: target.mobile_number,
          branch_id: target.branch_id,
          profile_photo: target.profile_photo || null,
        },
        impersonatedBy: req.adminUser.full_name,
      },
      message: `Now viewing as ${target.full_name}`,
    });
  } catch (err) {
    console.error('[Admin] Impersonate error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to impersonate' });
  }
});

// ─── POST /api/admin/login ───────────────────────────────────
// Dedicated admin login (username + password from Unify users table)
// No OTP required — used for /admin page
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username and password are required' });
    }

    // Find user with admin access_level
    const [users] = await pool.query(
      "SELECT id, full_name, username, password, mobile_number, access_level FROM users WHERE username = ? AND access_level = 'admin' LIMIT 1",
      [username.trim()]
    );

    if (users.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const adminUser = users[0];

    // Verify bcrypt password (PHP $2y$ is compatible with bcryptjs $2a$)
    const passwordHash = String(adminUser.password).replace(/^\$2y\$/, '$2a$');
    const isValid = await bcrypt.compare(password, passwordHash);
    if (!isValid) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    // Find a matching customer record (by full_name or mobile) — needed for JWT sub
    let customerId = null;
    let customerMobile = String(adminUser.mobile_number || '');

    const [byName] = await pool.query(
      "SELECT id, mobile_number, profile_photo FROM customers WHERE TRIM(full_name) = TRIM(?) LIMIT 1",
      [String(adminUser.full_name)]
    );
    if (byName.length > 0) {
      customerId = byName[0].id;
      customerMobile = byName[0].mobile_number;
    }

    // Generate admin JWT
    const token = jwt.sign(
      {
        iss: 'maskpro-care-api',
        sub: customerId || 0,
        mobile: customerMobile,
        branch_id: 1,
        is_admin: true,
        admin_user_id: adminUser.id,
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    const adminFullName = String(adminUser.full_name);
    console.log(`[Admin] Admin login: ${adminFullName} (user ID: ${adminUser.id}, customer_id: ${customerId})`);

    return res.json({
      success: true,
      data: {
        token,
        customer: {
          id: customerId || 0,
          full_name: adminFullName,
          mobile_number: customerMobile,
          branch_id: 1,
          profile_photo: (byName.length > 0 ? String(byName[0].profile_photo || '') : null) || null,
        },
        isAdmin: true,
        adminName: adminFullName,
      },
      message: `Welcome, ${adminFullName}!`,
    });
  } catch (err) {
    console.error('[Admin] Login error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── GET /api/admin/dashboard ────────────────────────────────
// Admin Analytics & Telemetry Dashboard
router.get('/dashboard', authenticateToken, requireAdmin, async (req, res) => {
  try {
    // 1. Core KPIs
    const [[custCount]] = await pool.query('SELECT COUNT(*) AS total FROM customers').catch(() => [[{ total: 0 }]]);
    const [[cardCount]] = await pool.query('SELECT COUNT(*) AS total FROM bookings WHERE status = "Done"').catch(() => [[{ total: 0 }]]);
    const [[pendingBookings]] = await pool.query('SELECT COUNT(*) AS total FROM care_booking_requests WHERE status = "pending"').catch(() => [[{ total: 0 }]]);
    const [[sosCount]] = await pool.query("SELECT COUNT(*) AS total FROM community_posts WHERE type = 'sos' AND status = 'open' AND is_approved = 1").catch(() => [[{ total: 0 }]]);
    const [[pendingModCount]] = await pool.query("SELECT COUNT(*) AS total FROM community_posts WHERE moderation_status = 'pending' AND status != 'hidden'").catch(() => [[{ total: 0 }]]);

    // 2. Platform Breakdown from care_app_telemetry
    const [platformRows] = await pool.query(`
      SELECT 
        platform,
        COUNT(DISTINCT customer_id) AS unique_users,
        COALESCE(SUM(session_count), 0) AS total_sessions,
        COALESCE(SUM(api_hits), 0) AS total_api_hits,
        MAX(last_seen_at) AS last_active_at
      FROM care_app_telemetry
      GROUP BY platform
    `);

    const platformMap = {
      web: { platform: 'web', label: 'Web App (Mobile & Desktop)', unique_users: 0, total_sessions: 0, total_api_hits: 0, last_active_at: null },
      android: { platform: 'android', label: 'Android Native App', unique_users: 0, total_sessions: 0, total_api_hits: 0, last_active_at: null },
      ios: { platform: 'ios', label: 'iOS Native App', unique_users: 0, total_sessions: 0, total_api_hits: 0, last_active_at: null },
    };

    let totalTelemetryUsers = 0;
    let totalSessions = 0;
    let totalApiHits = 0;

    for (const r of platformRows) {
      const key = r.platform;
      if (platformMap[key]) {
        platformMap[key].unique_users = Number(r.unique_users || 0);
        platformMap[key].total_sessions = Number(r.total_sessions || 0);
        platformMap[key].total_api_hits = Number(r.total_api_hits || 0);
        platformMap[key].last_active_at = r.last_active_at;
        totalTelemetryUsers += Number(r.unique_users || 0);
        totalSessions += Number(r.total_sessions || 0);
        totalApiHits += Number(r.total_api_hits || 0);
      }
    }

    const [[distinctActiveUsersRow]] = await pool.query('SELECT COUNT(DISTINCT customer_id) AS total FROM care_app_telemetry');
    const activeAppUsers = Number(distinctActiveUsersRow?.total || 0);

    // Sub-breakdown by app_type (desktop_web, mobile_web, native_android, native_ios)
    const [appTypeRows] = await pool.query(`
      SELECT app_type, COUNT(DISTINCT customer_id) AS users, COALESCE(SUM(session_count), 0) AS sessions
      FROM care_app_telemetry
      GROUP BY app_type
    `);

    // 3. Login & Authentication Funnel Stats
    const [[otpStats]] = await pool.query(`
      SELECT COUNT(*) AS total_otp_requests, COUNT(DISTINCT mobile) AS unique_mobiles,
             COALESCE(SUM(CASE WHEN used = 1 THEN 1 ELSE 0 END), 0) AS verified_otps
      FROM login_otp
    `).catch(() => [[{ total_otp_requests: 0, unique_mobiles: 0, verified_otps: 0 }]]);

    const [[magicStats]] = await pool.query(`
      SELECT COUNT(*) AS total_links,
             COALESCE(SUM(CASE WHEN used_count > 0 THEN 1 ELSE 0 END), 0) AS clicked_links,
             COALESCE(SUM(used_count), 0) AS total_clicks,
             COUNT(DISTINCT CASE WHEN used_count > 0 THEN customer_id END) AS unique_magic_users
      FROM care_magic_links
    `).catch(() => [[{ total_links: 0, clicked_links: 0, total_clicks: 0, unique_magic_users: 0 }]]);

    const [[aiLoginStats]] = await pool.query(`
      SELECT COUNT(*) AS total_attempts,
             COALESCE(SUM(CASE WHEN verified = 1 THEN 1 ELSE 0 END), 0) AS verified_logins
      FROM care_ai_login_logs
    `).catch(() => [[{ total_attempts: 0, verified_logins: 0 }]]);

    // 4. Who Uses the App (Live Active Users & Device Log)
    const [activeUsers] = await pool.query(`
      SELECT 
        t.id AS telemetry_id,
        t.customer_id,
        c.full_name,
        c.mobile_number,
        c.profile_photo,
        t.platform,
        t.app_type,
        t.device_label,
        t.auth_method,
        t.session_count,
        t.api_hits,
        t.first_seen_at,
        t.last_seen_at,
        (SELECT COUNT(*) FROM bookings b WHERE b.customer_id = c.id) AS booking_count
      FROM care_app_telemetry t
      JOIN customers c ON c.id = t.customer_id
      ORDER BY t.last_seen_at DESC
      LIMIT 40
    `).catch(() => [[]]);

    return res.json({
      success: true,
      data: {
        kpis: {
          total_customers: Number(custCount?.total || 0),
          active_app_users: activeAppUsers,
          web_users: Number(platformMap.web.unique_users || 0),
          android_users: Number(platformMap.android.unique_users || 0),
          ios_users: Number(platformMap.ios.unique_users || 0),
          native_users: Number(platformMap.android.unique_users || 0) + Number(platformMap.ios.unique_users || 0),
          total_sessions: totalSessions,
          total_api_hits: totalApiHits,
          total_care_cards: Number(cardCount?.total || 0),
          pending_booking_requests: Number(pendingBookings?.total || 0),
          active_sos_count: Number(sosCount?.total || 0),
          pending_moderation_count: Number(pendingModCount?.total || 0),
        },
        platforms: Object.values(platformMap).map((p) => ({
          ...p,
          share_pct: totalTelemetryUsers > 0 ? Math.round((p.unique_users / totalTelemetryUsers) * 100) : 0,
        })),
        app_types: appTypeRows,
        auth_methods: {
          otp: {
            total_requests: Number(otpStats?.total_otp_requests || 0),
            verified_logins: Number(otpStats?.verified_otps || 0),
            unique_users: Number(otpStats?.unique_mobiles || 0),
          },
          magic_link: {
            total_sent: Number(magicStats?.total_links || 0),
            links_opened: Number(magicStats?.clicked_links || 0),
            total_clicks: Number(magicStats?.total_clicks || 0),
            unique_users: Number(magicStats?.unique_magic_users || 0),
          },
          ai_verification: {
            total_attempts: Number(aiLoginStats?.total_attempts || 0),
            verified_logins: Number(aiLoginStats?.verified_logins || 0),
          },
        },
        active_users: activeUsers,
      },
    });
  } catch (err) {
    console.error('[Admin] Dashboard error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load admin dashboard' });
  }
});

// ─── GET /api/admin/community/posts ──────────────────────────
// List community posts for moderation queue
router.get('/community/posts', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const filter = String(req.query.filter || 'pending');
    let whereSql = '1=1';

    if (filter === 'pending') {
      whereSql = "p.moderation_status = 'pending' AND p.status != 'hidden'";
    } else if (filter === 'sos') {
      whereSql = "p.type = 'sos' AND p.status != 'hidden'";
    } else if (filter === 'approved') {
      whereSql = "p.is_approved = 1 AND p.moderation_status = 'approved' AND p.status != 'hidden'";
    } else if (filter === 'rejected') {
      whereSql = "(p.moderation_status = 'rejected' OR p.status = 'hidden')";
    }

    const [posts] = await pool.query(`
      SELECT 
        p.id, p.customer_id, p.type, p.title, p.body, p.location,
        p.status, p.is_approved, p.moderation_status, p.moderated_at, p.created_at,
        c.full_name AS author_name, c.mobile_number AS author_mobile, c.profile_photo AS author_photo,
        (SELECT COUNT(*) FROM community_comments cc WHERE cc.post_id = p.id AND cc.is_approved = 1) AS comment_count
      FROM community_posts p
      JOIN customers c ON c.id = p.customer_id
      WHERE ${whereSql}
      ORDER BY 
        CASE WHEN p.moderation_status = 'pending' THEN 0 WHEN p.type = 'sos' AND p.status = 'open' THEN 1 ELSE 2 END ASC,
        p.created_at DESC
      LIMIT 100
    `);

    const [[counts]] = await pool.query(`
      SELECT
        COALESCE(SUM(CASE WHEN moderation_status = 'pending' AND status != 'hidden' THEN 1 ELSE 0 END), 0) AS pending,
        COALESCE(SUM(CASE WHEN type = 'sos' AND status = 'open' AND is_approved = 1 THEN 1 ELSE 0 END), 0) AS active_sos,
        COALESCE(SUM(CASE WHEN is_approved = 1 AND moderation_status = 'approved' AND status != 'hidden' THEN 1 ELSE 0 END), 0) AS approved,
        COALESCE(SUM(CASE WHEN moderation_status = 'rejected' OR status = 'hidden' THEN 1 ELSE 0 END), 0) AS rejected,
        COUNT(*) AS total
      FROM community_posts
    `);

    return res.json({
      success: true,
      data: {
        posts,
        counts: {
          pending: Number(counts?.pending || 0),
          active_sos: Number(counts?.active_sos || 0),
          approved: Number(counts?.approved || 0),
          rejected: Number(counts?.rejected || 0),
          total: Number(counts?.total || 0),
        },
      },
    });
  } catch (err) {
    console.error('[Admin] Community moderation list error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load community posts' });
  }
});

// ─── POST /api/admin/community/moderate ──────────────────────
// Approve, reject/hide, resolve, or delete a community post
router.post('/community/moderate', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { post_id, action } = req.body;
    if (!post_id || !action) {
      return res.status(400).json({ success: false, message: 'post_id and action are required' });
    }

    const [postRows] = await pool.query('SELECT * FROM community_posts WHERE id = ? LIMIT 1', [post_id]);
    if (postRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }
    const post = postRows[0];

    if (action === 'approve') {
      await pool.query(
        `UPDATE community_posts 
         SET is_approved = 1, moderation_status = 'approved', status = IF(status = 'hidden', 'open', status),
             moderated_by = ?, moderated_at = NOW()
         WHERE id = ?`,
        [req.adminUser.id, post_id]
      );

      // Notify post author that their discussion is now approved & live
      await pool.query(
        `INSERT INTO customer_notifications (customer_id, type, title, message, link)
         VALUES (?, 'community_approved', 'Community Post Approved', ?, '/community-care')`,
        [post.customer_id, `Your post "${post.title}" has been approved by an admin and is now live in Community Care.`]
      ).catch(() => {});

      return res.json({ success: true, message: 'Post approved and published to Community Care' });
    }

    if (action === 'reject') {
      await pool.query(
        `UPDATE community_posts 
         SET is_approved = 0, moderation_status = 'rejected', status = 'hidden',
             moderated_by = ?, moderated_at = NOW()
         WHERE id = ?`,
        [req.adminUser.id, post_id]
      );
      await pool.query(
        `DELETE FROM customer_notifications 
         WHERE type IN ('community_sos', 'community_sos_comment', 'community_comment', 'community_moderation', 'community_approved')
           AND (title LIKE ? OR message LIKE ?)`,
        [`%${post.title}%`, `%${post.title}%`]
      ).catch(() => {});
      return res.json({ success: true, message: 'Post rejected and hidden from feed' });
    }

    if (action === 'resolve') {
      await pool.query(
        `UPDATE community_posts SET status = 'resolved', moderated_by = ?, moderated_at = NOW() WHERE id = ?`,
        [req.adminUser.id, post_id]
      );
      return res.json({ success: true, message: 'S.O.S. post marked as resolved' });
    }

    if (action === 'reopen') {
      await pool.query(
        `UPDATE community_posts SET status = 'open', moderated_by = ?, moderated_at = NOW() WHERE id = ?`,
        [req.adminUser.id, post_id]
      );
      return res.json({ success: true, message: 'Post reopened' });
    }

    if (action === 'delete') {
      await pool.query('DELETE FROM community_comments WHERE post_id = ?', [post_id]);
      await pool.query('DELETE FROM community_posts WHERE id = ?', [post_id]);
      await pool.query(
        `DELETE FROM customer_notifications 
         WHERE type IN ('community_sos', 'community_sos_comment', 'community_comment', 'community_moderation', 'community_approved')
           AND (title LIKE ? OR message LIKE ?)`,
        [`%${post.title}%`, `%${post.title}%`]
      ).catch(() => {});
      await pool.query(
        `DELETE FROM notifications 
         WHERE type IN ('community_sos', 'community_sos_comment', 'community_moderation')
           AND title LIKE ?`,
        [`%${post.title}%`]
      ).catch(() => {});
      return res.json({ success: true, message: 'Post and its notifications permanently deleted' });
    }

    return res.status(400).json({ success: false, message: 'Invalid moderation action' });
  } catch (err) {
    console.error('[Admin] Community moderate error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to moderate post' });
  }
});

module.exports = router;
