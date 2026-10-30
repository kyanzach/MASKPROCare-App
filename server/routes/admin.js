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
const { authenticateToken, recordAppTelemetry, JWT_SECRET } = require('../middleware/auth');

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
    if (customerId) {
      recordAppTelemetry(req, { sub: customerId, is_admin: true }, true);
    }

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

    const [[distinctActiveUsersRow]] = await pool.query(`
      SELECT
        COUNT(DISTINCT customer_id) AS total,
        COUNT(DISTINCT CASE WHEN TIMESTAMPDIFF(MINUTE, last_seen_at, NOW()) <= 5 THEN customer_id END) AS live_online_now,
        COUNT(DISTINCT CASE WHEN DATE(last_seen_at) = CURDATE() THEN customer_id END) AS active_today
      FROM care_app_telemetry
    `);
    const activeAppUsers = Number(distinctActiveUsersRow?.total || 0);
    const liveOnlineUsers = Number(distinctActiveUsersRow?.live_online_now || 0);
    const activeTodayUsers = Number(distinctActiveUsersRow?.active_today || 0);

    // Sub-breakdown by app_type (desktop_web, mobile_web, native_android, native_ios)
    const [appTypeRows] = await pool.query(`
      SELECT app_type, COUNT(DISTINCT customer_id) AS users, COALESCE(SUM(session_count), 0) AS sessions
      FROM care_app_telemetry
      GROUP BY app_type
    `);

    // 3. Login & Authentication Funnel Stats
    const [[otpStats]] = await pool.query(`
      SELECT COALESCE(SUM(request_count), COUNT(*)) AS total_otp_requests,
             COUNT(DISTINCT CASE WHEN last_login IS NOT NULL OR verified_count > 0 THEN COALESCE(customer_id, mobile_number) END) AS unique_mobiles,
             COALESCE(SUM(verified_count), SUM(CASE WHEN last_login IS NOT NULL THEN 1 ELSE 0 END), 0) AS verified_otps
      FROM login_otp
    `).catch(() => [[{ total_otp_requests: 0, unique_mobiles: 0, verified_otps: 0 }]]);

    const [[magicStats]] = await pool.query(`
      SELECT COUNT(*) AS total_links,
             COALESCE(SUM(CASE WHEN access_count > 0 THEN 1 ELSE 0 END), 0) AS clicked_links,
             COALESCE(SUM(access_count), 0) AS total_clicks,
             COALESCE(SUM(blocked_attempts), 0) AS blocked_attempts,
             COALESCE(SUM(CASE WHEN status = 'revoked' THEN 1 ELSE 0 END), 0) AS revoked_links,
             COUNT(DISTINCT CASE WHEN access_count > 0 THEN customer_id END) AS unique_magic_users
      FROM care_magic_links
    `).catch(() => [[{ total_links: 0, clicked_links: 0, total_clicks: 0, blocked_attempts: 0, revoked_links: 0, unique_magic_users: 0 }]]);

    const [[aiLoginStats]] = await pool.query(`
      SELECT GREATEST(
               (SELECT COUNT(*) FROM care_ai_login_sessions),
               (SELECT COUNT(*) FROM care_ai_login_logs)
             ) AS total_attempts,
             GREATEST(
               (SELECT COALESCE(SUM(CASE WHEN status = 'verified' THEN 1 ELSE 0 END), 0) FROM care_ai_login_sessions),
               (SELECT COALESCE(SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END), 0) FROM care_ai_login_logs)
             ) AS verified_logins
    `).catch(() => [[{ total_attempts: 0, verified_logins: 0 }]]);

    // 4. Magic Link Security & Intrusion Audit Logs (Paginated 5/page + Lazy Prefetch Window + Search & Sort)
    const secLimit = Math.min(200, Math.max(10, parseInt(req.query.sec_limit, 10) || 10));
    const secFilter = String(req.query.sec_filter || 'all');
    const secSearch = String(req.query.sec_search || '').trim();
    const secSort = String(req.query.sec_sort || 'newest');
    const usersLimit = Math.min(200, Math.max(20, parseInt(req.query.users_limit, 10) || 20));

    let secWhereSql = '1=1';
    const secParams = [];
    if (secFilter === 'blocked') {
      secWhereSql = "s.event_type NOT IN ('first_bind', 'authorized_access', 'preview_bot_ignored')";
    } else if (secFilter === 'authorized') {
      secWhereSql = "s.event_type IN ('first_bind', 'authorized_access')";
    } else if (secFilter === 'bot') {
      secWhereSql = "s.event_type = 'preview_bot_ignored'";
    }

    if (secSearch) {
      const likeVal = `%${secSearch}%`;
      const cleanIdVal = `%${secSearch.replace(/^#/, '')}%`;
      secWhereSql += ` AND (
        c.full_name LIKE ?
        OR c.mobile_number LIKE ?
        OR CAST(s.customer_id AS CHAR) LIKE ?
        OR CAST(s.id AS CHAR) LIKE ?
        OR v.make LIKE ?
        OR v.model LIKE ?
        OR CONCAT_WS(' ', v.make, v.model) LIKE ?
        OR v.plate_no LIKE ?
        OR s.slug LIKE ?
        OR s.request_url LIKE ?
        OR s.attempted_platform LIKE ?
        OR s.bound_platform LIKE ?
        OR s.browser_detail LIKE ?
        OR s.os_detail LIKE ?
        OR s.device_fingerprint LIKE ?
        OR s.ip_address LIKE ?
        OR s.location LIKE ?
        OR s.server_code LIKE ?
      )`;
      secParams.push(
        likeVal,
        likeVal,
        cleanIdVal,
        cleanIdVal,
        likeVal,
        likeVal,
        likeVal,
        likeVal,
        likeVal,
        likeVal,
        likeVal,
        likeVal,
        likeVal,
        likeVal,
        likeVal,
        likeVal,
        likeVal,
        likeVal
      );
    }

    let secOrderBySql = 's.created_at DESC, s.id DESC';
    if (secSort === 'oldest') {
      secOrderBySql = 's.created_at ASC, s.id ASC';
    } else if (secSort === 'most_attempts') {
      secOrderBySql = 's.device_attempt_count DESC, s.ip_attempt_count DESC, s.created_at DESC';
    } else if (secSort === 'customer_az') {
      secOrderBySql = "COALESCE(c.full_name, 'ZZZZ') ASC, s.created_at DESC";
    } else if (secSort === 'ip_az') {
      secOrderBySql = 's.ip_address ASC, s.created_at DESC';
    }

    const [[secCounts]] = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM care_magic_link_security_logs) AS total_all_events,
        (SELECT COUNT(*) FROM care_magic_link_security_logs WHERE event_type NOT IN ('first_bind', 'authorized_access', 'preview_bot_ignored')) AS total_intrusion_events,
        (SELECT COUNT(*) FROM care_magic_link_security_logs WHERE event_type IN ('first_bind', 'authorized_access')) AS total_authorized_events,
        (SELECT COUNT(*) FROM care_magic_link_security_logs WHERE event_type = 'preview_bot_ignored') AS total_bot_events,
        (SELECT COUNT(*) FROM care_blocked_devices WHERE is_active = 1 AND (blocked_until IS NULL OR blocked_until > NOW())) AS blocked_devices_count,
        (SELECT COUNT(*) FROM care_blocked_ips WHERE blocked_until IS NULL OR blocked_until > NOW()) AS blocked_ips_count,
        (SELECT COUNT(*) FROM care_app_telemetry t JOIN customers c ON c.id = t.customer_id) AS total_active_users_rows
    `).catch(() => [[{
      total_all_events: 0,
      total_intrusion_events: 0,
      total_authorized_events: 0,
      total_bot_events: 0,
      blocked_devices_count: 0,
      blocked_ips_count: 0,
      total_active_users_rows: 0,
    }]]);

    const [magicSecurityLogs] = await pool.query(`
      SELECT
        s.id,
        s.magic_link_id,
        s.customer_id,
        s.slug,
        s.request_url,
        s.event_type,
        s.http_status,
        s.server_code,
        s.attempted_platform,
        s.bound_platform,
        s.browser_detail,
        s.os_detail,
        s.device_token_hash,
        s.device_fingerprint,
        s.ip_address,
        s.location,
        s.user_agent,
        s.request_headers,
        s.device_attempt_count,
        s.ip_attempt_count,
        s.action_taken,
        s.created_at,
        c.full_name AS customer_name,
        c.mobile_number AS customer_mobile,
        ml.status AS link_status,
        ml.short_url,
        ml.bound_ip,
        ml.bound_at,
        ml.bound_user_agent,
        ml.access_count,
        ml.blocked_attempts,
        v.make AS vehicle_make,
        v.model AS vehicle_model,
        v.plate_no AS vehicle_plate,
        (SELECT COUNT(*) FROM care_blocked_devices bd
         WHERE bd.is_active = 1
           AND (bd.blocked_until IS NULL OR bd.blocked_until > NOW())
           AND (
             bd.device_fingerprint COLLATE utf8mb4_general_ci = s.device_fingerprint COLLATE utf8mb4_general_ci
             OR (s.device_token_hash IS NOT NULL AND bd.device_token_hash COLLATE utf8mb4_general_ci = s.device_token_hash COLLATE utf8mb4_general_ci)
           )
        ) AS is_device_blocked,
        (SELECT COUNT(*) FROM care_blocked_ips bi
         WHERE bi.ip_address COLLATE utf8mb4_general_ci = s.ip_address COLLATE utf8mb4_general_ci
           AND (bi.blocked_until IS NULL OR bi.blocked_until > NOW())
        ) AS is_ip_blocked
      FROM care_magic_link_security_logs s
      LEFT JOIN customers c ON c.id = s.customer_id
      LEFT JOIN care_magic_links ml ON ml.id = s.magic_link_id
      LEFT JOIN vehicles v ON v.id = ml.vehicle_id
      WHERE ${secWhereSql}
      ORDER BY ${secOrderBySql}
      LIMIT ?
    `, [...secParams, secLimit]).catch((err) => {
      console.error('[Admin] magicSecurityLogs query error:', err.message);
      return [[]];
    });

    // 5. Who Uses the App (Live Active Users & Device Log — Paginated 10/page + Lazy Prefetch Window)
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
        t.ip_address,
        t.session_count,
        t.api_hits,
        t.first_seen_at,
        t.last_seen_at,
        TIMESTAMPDIFF(SECOND, t.last_seen_at, NOW()) AS seconds_since_last_seen,
        CASE
          WHEN TIMESTAMPDIFF(MINUTE, t.last_seen_at, NOW()) <= 5 THEN 'online'
          WHEN DATE(t.last_seen_at) = CURDATE() THEN 'today'
          ELSE 'offline'
        END AS presence_status,
        (SELECT COUNT(*) FROM bookings b WHERE b.customer_id = c.id) AS booking_count
      FROM care_app_telemetry t
      JOIN customers c ON c.id = t.customer_id
      ORDER BY t.last_seen_at DESC
      LIMIT ?
    `, [usersLimit]).catch(() => [[]]);

    // 6. Maintenance Reminder SMS & Magic Link Delivery Tracker (Paginated + Search + Filter + Sort)
    const smsLimit = Math.min(200, Math.max(15, parseInt(req.query.sms_limit, 10) || 20));
    const smsFilter = String(req.query.sms_filter || 'all');
    const smsSearch = String(req.query.sms_search || '').trim();
    const smsSort = String(req.query.sms_sort || 'newest');

    const baseDispatchedSql = "(ml.reminder_id IS NULL OR (pr.sms_status IN ('Sent', 'Failed') AND pr.sms_set_date_time <= NOW()))";
    let smsWhereSql = baseDispatchedSql;
    const smsParams = [];
    if (smsFilter === 'today') {
      smsWhereSql = `${baseDispatchedSql} AND DATE(ml.created_at) = CURDATE()`;
    } else if (smsFilter === 'sent') {
      smsWhereSql = `${baseDispatchedSql} AND COALESCE(pr.sms_status, 'Sent') = 'Sent'`;
    } else if (smsFilter === 'failed') {
      smsWhereSql = `${baseDispatchedSql} AND pr.sms_status = 'Failed'`;
    } else if (smsFilter === 'opened') {
      smsWhereSql = `${baseDispatchedSql} AND ml.access_count > 0`;
    } else if (smsFilter === 'unopened') {
      smsWhereSql = `${baseDispatchedSql} AND ml.access_count = 0 AND COALESCE(pr.sms_status, 'Sent') = 'Sent'`;
    }

    if (smsSearch) {
      const likeVal = `%${smsSearch}%`;
      const cleanIdVal = `%${smsSearch.replace(/^#/, '')}%`;
      smsWhereSql += ` AND (
        c.full_name LIKE ?
        OR c.mobile_number LIKE ?
        OR CAST(ml.customer_id AS CHAR) LIKE ?
        OR CAST(ml.booking_id AS CHAR) LIKE ?
        OR CAST(ml.reminder_id AS CHAR) LIKE ?
        OR v.make LIKE ?
        OR v.model LIKE ?
        OR CONCAT_WS(' ', v.make, v.model) LIKE ?
        OR v.plate_no LIKE ?
        OR ml.slug LIKE ?
        OR ml.short_url LIKE ?
        OR ml.bound_platform LIKE ?
        OR ml.bound_ip LIKE ?
        OR pr.sms_status LIKE ?
        OR pr.error_log LIKE ?
      )`;
      smsParams.push(
        likeVal, likeVal, cleanIdVal, cleanIdVal, cleanIdVal,
        likeVal, likeVal, likeVal, likeVal,
        likeVal, likeVal, likeVal, likeVal, likeVal, likeVal
      );
    }

    let smsOrderBySql = 'ml.created_at DESC, ml.id DESC';
    if (smsSort === 'opened_first') {
      smsOrderBySql = 'ml.access_count DESC, ml.last_accessed_at DESC, ml.id DESC';
    } else if (smsSort === 'failed_first') {
      smsOrderBySql = "CASE WHEN pr.sms_status = 'Failed' THEN 0 ELSE 1 END ASC, ml.id DESC";
    } else if (smsSort === 'customer_az') {
      smsOrderBySql = "COALESCE(c.full_name, 'ZZZZ') ASC, ml.id DESC";
    } else if (smsSort === 'oldest') {
      smsOrderBySql = 'ml.created_at ASC, ml.id ASC';
    }

    const [[smsReminderSummary]] = await pool.query(`
      SELECT
        COUNT(*) AS total_generated,
        COALESCE(SUM(CASE WHEN DATE(ml.created_at) = CURDATE() THEN 1 ELSE 0 END), 0) AS today_generated,
        COALESCE(SUM(CASE WHEN COALESCE(pr.sms_status, 'Sent') = 'Sent' THEN 1 ELSE 0 END), 0) AS total_sent,
        COALESCE(SUM(CASE WHEN DATE(ml.created_at) = CURDATE() AND COALESCE(pr.sms_status, 'Sent') = 'Sent' THEN 1 ELSE 0 END), 0) AS today_sent,
        COALESCE(SUM(CASE WHEN pr.sms_status = 'Failed' THEN 1 ELSE 0 END), 0) AS total_failed,
        COALESCE(SUM(CASE WHEN DATE(ml.created_at) = CURDATE() AND pr.sms_status = 'Failed' THEN 1 ELSE 0 END), 0) AS today_failed,
        COALESCE(SUM(CASE WHEN ml.access_count > 0 THEN 1 ELSE 0 END), 0) AS total_opened,
        COALESCE(SUM(CASE WHEN DATE(ml.created_at) = CURDATE() AND ml.access_count > 0 THEN 1 ELSE 0 END), 0) AS today_opened,
        COALESCE(SUM(CASE WHEN ml.access_count = 0 AND COALESCE(pr.sms_status, 'Sent') = 'Sent' THEN 1 ELSE 0 END), 0) AS total_unopened,
        MIN(CASE WHEN DATE(ml.created_at) = CURDATE() THEN ml.created_at END) AS today_cron_started_at,
        MAX(CASE WHEN DATE(ml.created_at) = CURDATE() THEN ml.created_at END) AS today_cron_finished_at
      FROM care_magic_links ml
      LEFT JOIN sms_periodic_reminders pr ON pr.sms_periodic_reminders_id = ml.reminder_id
      WHERE (ml.reminder_id IS NULL OR (pr.sms_status IN ('Sent', 'Failed') AND pr.sms_set_date_time <= NOW()))
    `).catch(() => [[{
      total_generated: 0, today_generated: 0, total_sent: 0, today_sent: 0,
      total_failed: 0, today_failed: 0, total_opened: 0, today_opened: 0,
      total_unopened: 0, today_cron_started_at: null, today_cron_finished_at: null,
    }]]);

    const [smsReminderLogs] = await pool.query(`
      SELECT
        ml.id,
        ml.slug,
        ml.short_url,
        ml.customer_id,
        ml.vehicle_id,
        ml.booking_id,
        ml.reminder_id,
        ml.bound_platform,
        ml.bound_user_agent,
        ml.bound_ip,
        ml.bound_at,
        ml.last_accessed_at,
        ml.access_count,
        ml.blocked_attempts,
        ml.status AS link_status,
        ml.created_at,
        c.full_name AS customer_name,
        c.mobile_number AS customer_mobile,
        v.make AS vehicle_make,
        v.model AS vehicle_model,
        v.plate_no AS vehicle_plate,
        COALESCE(pr.sms_status, 'Sent') AS sms_status,
        COALESCE(pr.sms_this_template_code, 'maintenance_reminder') AS template_code,
        pr.error_log AS sms_log_detail,
        (SELECT sh.reference_id FROM sms_history sh
         WHERE sh.customer_id = ml.customer_id
           AND ABS(TIMESTAMPDIFF(SECOND, sh.created_at, ml.created_at)) <= 120
         ORDER BY sh.id DESC LIMIT 1) AS itexmo_ref_id,
        (SELECT sh.credits_used FROM sms_history sh
         WHERE sh.customer_id = ml.customer_id
           AND ABS(TIMESTAMPDIFF(SECOND, sh.created_at, ml.created_at)) <= 120
         ORDER BY sh.id DESC LIMIT 1) AS sms_credits,
        (SELECT MAX(t.last_seen_at) FROM care_app_telemetry t WHERE t.customer_id = ml.customer_id) AS app_last_seen_at,
        (SELECT COALESCE(SUM(t.session_count), 0) FROM care_app_telemetry t WHERE t.customer_id = ml.customer_id) AS app_sessions,
        (SELECT COALESCE(SUM(t.api_hits), 0) FROM care_app_telemetry t WHERE t.customer_id = ml.customer_id) AS app_api_hits,
        (SELECT s.location FROM care_magic_link_security_logs s WHERE s.magic_link_id = ml.id AND s.location IS NOT NULL ORDER BY s.id DESC LIMIT 1) AS bound_location,
        (SELECT s.browser_detail FROM care_magic_link_security_logs s WHERE s.magic_link_id = ml.id AND s.event_type IN ('first_bind', 'authorized_access') ORDER BY s.id DESC LIMIT 1) AS bound_browser,
        (SELECT s.os_detail FROM care_magic_link_security_logs s WHERE s.magic_link_id = ml.id AND s.event_type IN ('first_bind', 'authorized_access') ORDER BY s.id DESC LIMIT 1) AS bound_os
      FROM care_magic_links ml
      LEFT JOIN customers c ON c.id = ml.customer_id
      LEFT JOIN vehicles v ON v.id = ml.vehicle_id
      LEFT JOIN sms_periodic_reminders pr ON pr.sms_periodic_reminders_id = ml.reminder_id
      WHERE ${smsWhereSql}
      ORDER BY ${smsOrderBySql}
      LIMIT ?
    `, [...smsParams, smsLimit]).catch((err) => {
      console.error('[Admin] smsReminderLogs query error:', err.message);
      return [[]];
    });

    return res.json({
      success: true,
      data: {
        kpis: {
          total_customers: Number(custCount?.total || 0),
          active_app_users: activeAppUsers,
          live_online_users: liveOnlineUsers,
          active_today_users: activeTodayUsers,
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
            blocked_attempts: Number(magicStats?.blocked_attempts || 0),
            revoked_links: Number(magicStats?.revoked_links || 0),
            unique_users: Number(magicStats?.unique_magic_users || 0),
          },
          ai_verification: {
            total_attempts: Number(aiLoginStats?.total_attempts || 0),
            verified_logins: Number(aiLoginStats?.verified_logins || 0),
          },
        },
        security_overview: {
          total_all_events: Number(secCounts?.total_all_events || 0),
          total_intrusion_events: Number(secCounts?.total_intrusion_events || 0),
          total_authorized_events: Number(secCounts?.total_authorized_events || 0),
          total_bot_events: Number(secCounts?.total_bot_events || 0),
          blocked_attempts: Number(magicStats?.blocked_attempts || 0),
          blocked_devices_count: Number(secCounts?.blocked_devices_count || 0),
          blocked_ips_count: Number(secCounts?.blocked_ips_count || 0),
          revoked_links_count: Number(magicStats?.revoked_links || 0),
        },
        magic_security_logs: magicSecurityLogs,
        sms_reminder_summary: {
          total_generated: Number(smsReminderSummary?.total_generated || 0),
          today_generated: Number(smsReminderSummary?.today_generated || 0),
          total_sent: Number(smsReminderSummary?.total_sent || 0),
          today_sent: Number(smsReminderSummary?.today_sent || 0),
          total_failed: Number(smsReminderSummary?.total_failed || 0),
          today_failed: Number(smsReminderSummary?.today_failed || 0),
          total_opened: Number(smsReminderSummary?.total_opened || 0),
          today_opened: Number(smsReminderSummary?.today_opened || 0),
          total_unopened: Number(smsReminderSummary?.total_unopened || 0),
          today_cron_started_at: smsReminderSummary?.today_cron_started_at || null,
          today_cron_finished_at: smsReminderSummary?.today_cron_finished_at || null,
        },
        sms_reminder_logs: smsReminderLogs,
        active_users: activeUsers,
        active_users_total: Number(secCounts?.total_active_users_rows || activeUsers.length),
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

// ─── POST /api/admin/security/action ─────────────────────────
// Admin controls for Magic Link Security & Intrusion Audit Log:
//   - block_device / unblock_device
//   - block_ip / unblock_ip
//   - reset_device_lock (allow customer to bind a new phone)
//   - revoke_link / reactivate_link
router.post('/security/action', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const {
      action,
      log_id,
      magic_link_id,
      device_fingerprint,
      device_token_hash,
      device_label,
      ip_address,
      user_agent,
    } = req.body || {};

    if (!action) {
      return res.status(400).json({ success: false, message: 'action is required' });
    }

    if (action === 'block_device') {
      if (!device_fingerprint) {
        return res.status(400).json({ success: false, message: 'device_fingerprint is required' });
      }
      await pool.query(
        `INSERT INTO care_blocked_devices
           (device_fingerprint, device_token_hash, device_label, ip_address, user_agent, reason, attempts_count, is_active, blocked_until, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 10, 1, NULL, NOW(), NOW())
         ON DUPLICATE KEY UPDATE
           is_active = 1,
           blocked_until = NULL,
           reason = VALUES(reason),
           updated_at = NOW()`,
        [
          device_fingerprint,
          device_token_hash || null,
          device_label || 'Blocked Device',
          ip_address || null,
          String(user_agent || '').slice(0, 490),
          `Manually blocked by Admin (${req.adminUser.full_name})`,
        ]
      );
      if (log_id) {
        await pool.query('UPDATE care_magic_link_security_logs SET action_taken = "admin_device_blocked" WHERE id = ?', [log_id]).catch(() => {});
      }
      return res.json({ success: true, message: `Device (${device_label || 'Unknown'}) blocked` });
    }

    if (action === 'unblock_device') {
      if (!device_fingerprint) {
        return res.status(400).json({ success: false, message: 'device_fingerprint is required' });
      }
      await pool.query(
        'UPDATE care_blocked_devices SET is_active = 0, updated_at = NOW() WHERE device_fingerprint = ? OR (device_token_hash IS NOT NULL AND device_token_hash = ?)',
        [device_fingerprint, device_token_hash || '']
      );
      if (log_id) {
        await pool.query('UPDATE care_magic_link_security_logs SET action_taken = "blocked_403" WHERE id = ?', [log_id]).catch(() => {});
      }
      return res.json({ success: true, message: 'Device unblocked' });
    }

    if (action === 'block_ip') {
      if (!ip_address) {
        return res.status(400).json({ success: false, message: 'ip_address is required' });
      }
      await pool.query(
        `INSERT INTO care_blocked_ips (ip_address, reason, attempts_count, blocked_until, created_at, updated_at)
         VALUES (?, ?, 100, NULL, NOW(), NOW())
         ON DUPLICATE KEY UPDATE
           reason = VALUES(reason),
           blocked_until = NULL,
           updated_at = NOW()`,
        [ip_address, `Manually blocked by Admin (${req.adminUser.full_name})`]
      );
      if (log_id) {
        await pool.query('UPDATE care_magic_link_security_logs SET action_taken = "admin_ip_blocked" WHERE id = ?', [log_id]).catch(() => {});
      }
      return res.json({ success: true, message: `IP ${ip_address} blocked` });
    }

    if (action === 'unblock_ip') {
      if (!ip_address) {
        return res.status(400).json({ success: false, message: 'ip_address is required' });
      }
      await pool.query('DELETE FROM care_blocked_ips WHERE ip_address = ?', [ip_address]);
      if (log_id) {
        await pool.query('UPDATE care_magic_link_security_logs SET action_taken = "blocked_403" WHERE id = ?', [log_id]).catch(() => {});
      }
      return res.json({ success: true, message: `IP ${ip_address} unblocked` });
    }

    if (action === 'reset_device_lock') {
      if (!magic_link_id) {
        return res.status(400).json({ success: false, message: 'magic_link_id is required' });
      }
      await pool.query(
        `UPDATE care_magic_links
         SET bound_device_token_hash = NULL,
             bound_platform = NULL,
             bound_user_agent = NULL,
             bound_ip = NULL,
             bound_at = NULL
         WHERE id = ?`,
        [magic_link_id]
      );
      return res.json({ success: true, message: 'Device lock cleared — the next device to open this link will bind to it' });
    }

    if (action === 'revoke_link') {
      if (!magic_link_id) {
        return res.status(400).json({ success: false, message: 'magic_link_id is required' });
      }
      await pool.query("UPDATE care_magic_links SET status = 'revoked' WHERE id = ?", [magic_link_id]);
      return res.json({ success: true, message: 'Magic link revoked' });
    }

    if (action === 'reactivate_link') {
      if (!magic_link_id) {
        return res.status(400).json({ success: false, message: 'magic_link_id is required' });
      }
      await pool.query("UPDATE care_magic_links SET status = 'active' WHERE id = ?", [magic_link_id]);
      return res.json({ success: true, message: 'Magic link reactivated' });
    }

    return res.status(400).json({ success: false, message: 'Unknown security action' });
  } catch (err) {
    console.error('[Admin] Security action error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to execute security action' });
  }
});

module.exports = router;
