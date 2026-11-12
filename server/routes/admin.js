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
const { getMotorizedVehicleEligibilitySql } = require('../utils/vehicleFilter');
const { getTrustedClientIp, checkRateLimit, recordRateLimitHit, clearRateLimit } = require('../utils/security');

// Immutable allowlist of customer IDs linked to Unify super-admins (Ryan Paco = #1924)
const VERIFIED_ADMIN_CUSTOMER_IDS = new Set([1924]);

// ─── Helper: check if customer is admin ─────────────────────
async function isAdminUser(customerId, mobile, userClaims = {}) {
  // Method 0: Explicit bcrypt-verified admin token from POST /api/admin/login
  if (userClaims?.is_admin && userClaims?.admin_user_id) {
    const [byAdminId] = await pool.query(
      "SELECT id, full_name, access_level FROM users WHERE id = ? AND access_level = 'admin' LIMIT 1",
      [parseInt(userClaims.admin_user_id, 10)]
    );
    if (byAdminId.length > 0) return byAdminId[0];
  }

  // Method 1: Direct verified mobile match in users table
  if (mobile) {
    const cleanLast10 = String(mobile).replace(/\D/g, '').slice(-10);
    if (cleanLast10.length === 10) {
      const [byMobile] = await pool.query(
        "SELECT id, full_name, access_level FROM users WHERE RIGHT(REPLACE(mobile_number, ' ', ''), 10) = ? AND access_level = 'admin' LIMIT 1",
        [cleanLast10]
      );
      if (byMobile.length > 0) return byMobile[0];
    }
  }

  // Method 2: Cross-reference strictly restricted to immutable verified admin customer_id (#1924)
  // Prevents privilege escalation via mutable customers.full_name updates
  const numericCustId = parseInt(customerId, 10);
  if (numericCustId && VERIFIED_ADMIN_CUSTOMER_IDS.has(numericCustId)) {
    const [byName] = await pool.query(
      `SELECT u.id, u.full_name, u.access_level
       FROM users u
       JOIN customers c ON TRIM(u.full_name) = TRIM(c.full_name)
       WHERE c.id = ? AND u.access_level = 'admin'
       LIMIT 1`,
      [numericCustId]
    );
    if (byName.length > 0) return byName[0];
  }

  return null;
}

// ─── Admin check middleware ──────────────────────────────────
async function requireAdmin(req, res, next) {
  try {
    const admin = await isAdminUser(req.user.customer_id, req.user.mobile, req.user);
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
    const admin = await isAdminUser(req.user.customer_id, req.user.mobile, req.user);
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
// Rate-limited: 5 failed attempts / 15 mins -> 15-min lockout
router.post('/login', async (req, res) => {
  try {
    const clientIp = getTrustedClientIp(req);
    const ipLimit = checkRateLimit('admin_login_ip', clientIp, { maxAttempts: 5, windowMs: 15 * 60 * 1000 });
    if (!ipLimit.allowed) {
      return res.status(429).json({
        success: false,
        message: 'Too many failed admin login attempts. Please wait 15 minutes before trying again.',
      });
    }

    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username and password are required' });
    }

    const cleanUsername = String(username).trim().toLowerCase();
    const userLimit = checkRateLimit('admin_login_user', cleanUsername, { maxAttempts: 5, windowMs: 15 * 60 * 1000 });
    if (!userLimit.allowed) {
      return res.status(429).json({
        success: false,
        message: 'Account temporarily locked due to repeated failed attempts. Please wait 15 minutes.',
      });
    }

    // Find user with admin access_level
    const [users] = await pool.query(
      "SELECT id, full_name, username, password, mobile_number, access_level FROM users WHERE username = ? AND access_level = 'admin' LIMIT 1",
      [String(username).trim()]
    );

    if (users.length === 0) {
      recordRateLimitHit('admin_login_ip', clientIp, { maxAttempts: 5, windowMs: 15 * 60 * 1000, lockoutMs: 15 * 60 * 1000 });
      recordRateLimitHit('admin_login_user', cleanUsername, { maxAttempts: 5, windowMs: 15 * 60 * 1000, lockoutMs: 15 * 60 * 1000 });
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const adminUser = users[0];

    // Verify bcrypt password (PHP $2y$ is compatible with bcryptjs $2a$)
    const passwordHash = String(adminUser.password).replace(/^\$2y\$/, '$2a$');
    const isValid = await bcrypt.compare(String(password), passwordHash);
    if (!isValid) {
      recordRateLimitHit('admin_login_ip', clientIp, { maxAttempts: 5, windowMs: 15 * 60 * 1000, lockoutMs: 15 * 60 * 1000 });
      recordRateLimitHit('admin_login_user', cleanUsername, { maxAttempts: 5, windowMs: 15 * 60 * 1000, lockoutMs: 15 * 60 * 1000 });
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    clearRateLimit('admin_login_ip', clientIp);
    clearRateLimit('admin_login_user', cleanUsername);

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
    const [[cardCount]] = await pool.query('SELECT COUNT(*) AS total FROM loyalty_cards WHERE is_active = 1').catch(() => [[{ total: 0 }]]);
    const [[pendingBookings]] = await pool.query("SELECT COUNT(*) AS total FROM booking_requests WHERE status IN ('pending', 'negotiating')").catch(() => [[{ total: 0 }]]);
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
        (SELECT COUNT(*) FROM bookings b WHERE b.customer_id = c.id) AS booking_count,
        (SELECT COUNT(*) FROM care_app_activity_logs al WHERE al.customer_id = c.id) AS activity_count
      FROM care_app_telemetry t
      JOIN customers c ON c.id = t.customer_id
      ORDER BY t.last_seen_at DESC
      LIMIT ?
    `, [usersLimit]).catch(() => [[]]);

    // 6. Maintenance Reminder SMS & Magic Link Delivery Tracker (Paginated + Search + Filter + Sort + Date Range)
    const smsLimit = Math.min(1000, Math.max(15, parseInt(req.query.sms_limit, 10) || 500));
    const smsFilter = String(req.query.sms_filter || 'all');
    const smsSearch = String(req.query.sms_search || '').trim();
    const smsSort = String(req.query.sms_sort || 'newest');
    const smsFrom = String(req.query.sms_from || '').trim();
    const smsTo = String(req.query.sms_to || '').trim();

    const unifiedTrackerSubquery = `
      (
        SELECT
          ml.id AS id,
          ml.slug AS slug,
          ml.short_url AS short_url,
          ml.customer_id AS customer_id,
          ml.vehicle_id AS vehicle_id,
          ml.booking_id AS booking_id,
          ml.reminder_id AS reminder_id,
          ml.bound_platform AS bound_platform,
          ml.bound_user_agent AS bound_user_agent,
          ml.bound_ip AS bound_ip,
          ml.bound_at AS bound_at,
          ml.last_accessed_at AS last_accessed_at,
          ml.access_count AS access_count,
          ml.blocked_attempts AS blocked_attempts,
          ml.status AS link_status,
          ml.created_at AS created_at,
          COALESCE(pr.sms_status, 'Sent') AS sms_status,
          COALESCE(pr.sms_this_template_code, 'maintenance_reminder') AS template_code,
          pr.error_log AS sms_log_detail
        FROM care_magic_links ml
        LEFT JOIN sms_periodic_reminders pr ON pr.sms_periodic_reminders_id = ml.reminder_id
        LEFT JOIN vehicles v ON v.id = ml.vehicle_id
        LEFT JOIN bookings b ON b.booking_id = ml.booking_id
        WHERE ml.status != 'revoked'
          AND (ml.reminder_id IS NULL OR (pr.sms_status IN ('Sent', 'Failed') AND pr.sms_set_date_time <= NOW()))
          AND (v.id IS NULL OR ${getMotorizedVehicleEligibilitySql('v', 'b', null)})

        UNION ALL

        SELECT
          -MAX(pr.sms_periodic_reminders_id) AS id,
          NULL AS slug,
          NULL AS short_url,
          b.customer_id AS customer_id,
          b.customer_vehicle_id AS vehicle_id,
          MAX(pr.booking_id) AS booking_id,
          MAX(pr.sms_periodic_reminders_id) AS reminder_id,
          NULL AS bound_platform,
          NULL AS bound_user_agent,
          NULL AS bound_ip,
          NULL AS bound_at,
          NULL AS last_accessed_at,
          0 AS access_count,
          0 AS blocked_attempts,
          'skipped_invalid_mobile' AS link_status,
          CASE
            WHEN YEAR(MAX(pr.sms_set_date_time)) = YEAR(CURDATE()) AND MONTH(MAX(pr.sms_set_date_time)) = MONTH(CURDATE())
            THEN TIMESTAMP(CURDATE(), '07:00:25')
            ELSE MAX(pr.sms_set_date_time)
          END AS created_at,
          'Failed' AS sms_status,
          pr.sms_this_template_code AS template_code,
          MAX(pr.error_log) AS sms_log_detail
        FROM sms_periodic_reminders pr
        JOIN bookings b ON b.booking_id = pr.booking_id
        JOIN vehicles v ON v.id = b.customer_vehicle_id
        WHERE pr.sms_status = 'Failed'
          AND pr.sms_set_date_time <= NOW()
          AND ${getMotorizedVehicleEligibilitySql('v', 'b', null)}
          AND NOT EXISTS (
            SELECT 1 FROM care_magic_links ml2
            WHERE ml2.reminder_id = pr.sms_periodic_reminders_id
               OR (ml2.customer_id = b.customer_id AND ml2.vehicle_id = b.customer_vehicle_id)
          )
        GROUP BY b.customer_id, b.customer_vehicle_id, YEAR(pr.sms_set_date_time), MONTH(pr.sms_set_date_time), pr.sms_this_template_code
      ) AS tr
    `;

    let smsWhereSql = '1=1';
    const smsParams = [];
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!smsSearch) {
      if (dateRegex.test(smsFrom) && dateRegex.test(smsTo)) {
        smsWhereSql += ' AND DATE(tr.created_at) BETWEEN ? AND ?';
        smsParams.push(smsFrom, smsTo);
      } else if (dateRegex.test(smsFrom)) {
        smsWhereSql += ' AND DATE(tr.created_at) >= ?';
        smsParams.push(smsFrom);
      } else if (dateRegex.test(smsTo)) {
        smsWhereSql += ' AND DATE(tr.created_at) <= ?';
        smsParams.push(smsTo);
      } else if (smsFilter === 'today') {
        smsWhereSql += ' AND DATE(tr.created_at) = CURDATE()';
      }

      if (smsFilter === 'sent') {
        smsWhereSql += " AND tr.sms_status = 'Sent'";
      } else if (smsFilter === 'failed') {
        smsWhereSql += " AND tr.sms_status = 'Failed'";
      } else if (smsFilter === 'opened') {
        smsWhereSql += ' AND tr.access_count > 0';
      } else if (smsFilter === 'engaged') {
        smsWhereSql += ' AND (tr.access_count > 0 OR EXISTS (SELECT 1 FROM care_app_telemetry t WHERE t.customer_id = tr.customer_id AND t.session_count > 0))';
      } else if (smsFilter === 'booked') {
        smsWhereSql += " AND (EXISTS (SELECT 1 FROM booking_requests br WHERE br.customer_id = tr.customer_id AND br.time_added >= DATE_SUB(tr.created_at, INTERVAL 15 MINUTE)) OR EXISTS (SELECT 1 FROM bookings b WHERE b.customer_id = tr.customer_id AND b.time_added >= DATE_SUB(tr.created_at, INTERVAL 15 MINUTE) AND (b.notes IS NULL OR b.notes NOT LIKE '%CANCELLED:%')))";
      } else if (smsFilter === 'unopened') {
        smsWhereSql += " AND tr.access_count = 0 AND tr.sms_status = 'Sent'";
      }
    }

    if (smsSearch) {
      const likeVal = `%${smsSearch}%`;
      const cleanIdVal = `%${smsSearch.replace(/^#/, '')}%`;
      smsWhereSql += ` AND (
        c.full_name LIKE ?
        OR c.mobile_number LIKE ?
        OR CAST(tr.customer_id AS CHAR) LIKE ?
        OR CAST(tr.booking_id AS CHAR) LIKE ?
        OR CAST(tr.reminder_id AS CHAR) LIKE ?
        OR v.make LIKE ?
        OR v.model LIKE ?
        OR CONCAT_WS(' ', v.make, v.model) LIKE ?
        OR v.plate_no LIKE ?
        OR COALESCE(tr.slug, '') LIKE ?
        OR COALESCE(tr.short_url, '') LIKE ?
        OR COALESCE(tr.bound_platform, '') LIKE ?
        OR COALESCE(tr.bound_ip, '') LIKE ?
        OR tr.sms_status LIKE ?
        OR COALESCE(tr.sms_log_detail, '') LIKE ?
      )`;
      smsParams.push(
        likeVal, likeVal, cleanIdVal, cleanIdVal, cleanIdVal,
        likeVal, likeVal, likeVal, likeVal,
        likeVal, likeVal, likeVal, likeVal, likeVal, likeVal
      );
    }

    let smsOrderBySql = 'tr.created_at DESC, tr.id DESC';
    if (smsSort === 'opened_first') {
      smsOrderBySql = 'tr.access_count DESC, tr.last_accessed_at DESC, tr.created_at DESC, tr.id DESC';
    } else if (smsSort === 'failed_first') {
      smsOrderBySql = "CASE WHEN tr.sms_status = 'Failed' THEN 0 ELSE 1 END ASC, tr.created_at DESC, tr.id DESC";
    } else if (smsSort === 'sent_first') {
      smsOrderBySql = "CASE WHEN tr.sms_status = 'Sent' THEN 0 ELSE 1 END ASC, tr.created_at DESC, tr.id DESC";
    } else if (smsSort === 'customer_az') {
      smsOrderBySql = "COALESCE(NULLIF(TRIM(c.full_name), ''), 'ZZZZ') ASC, tr.created_at DESC, tr.id DESC";
    } else if (smsSort === 'oldest') {
      smsOrderBySql = 'tr.created_at ASC, tr.id ASC';
    }

    const [[smsReminderSummary]] = await pool.query(`
      SELECT
        COUNT(*) AS total_generated,
        COALESCE(SUM(CASE WHEN DATE(tr.created_at) = CURDATE() THEN 1 ELSE 0 END), 0) AS today_generated,
        COALESCE(SUM(CASE WHEN tr.sms_status = 'Sent' THEN 1 ELSE 0 END), 0) AS total_sent,
        COALESCE(SUM(CASE WHEN DATE(tr.created_at) = CURDATE() AND tr.sms_status = 'Sent' THEN 1 ELSE 0 END), 0) AS today_sent,
        COALESCE(SUM(CASE WHEN tr.sms_status = 'Failed' THEN 1 ELSE 0 END), 0) AS total_failed,
        COALESCE(SUM(CASE WHEN DATE(tr.created_at) = CURDATE() AND tr.sms_status = 'Failed' THEN 1 ELSE 0 END), 0) AS today_failed,
        COALESCE(SUM(CASE WHEN tr.access_count > 0 THEN 1 ELSE 0 END), 0) AS total_opened,
        COALESCE(SUM(CASE WHEN DATE(tr.created_at) = CURDATE() AND tr.access_count > 0 THEN 1 ELSE 0 END), 0) AS today_opened,
        COALESCE(SUM(CASE WHEN tr.access_count > 0 AND EXISTS (SELECT 1 FROM care_app_telemetry t WHERE t.customer_id = tr.customer_id AND t.session_count > 0) THEN 1 ELSE 0 END), 0) AS total_engaged,
        COALESCE(SUM(CASE WHEN DATE(tr.created_at) = CURDATE() AND tr.access_count > 0 AND EXISTS (SELECT 1 FROM care_app_telemetry t WHERE t.customer_id = tr.customer_id AND t.session_count > 0) THEN 1 ELSE 0 END), 0) AS today_engaged,
        COALESCE(SUM(CASE WHEN tr.access_count = 0 AND tr.sms_status = 'Sent' THEN 1 ELSE 0 END), 0) AS total_unopened,
        COALESCE(SUM(CASE WHEN DATE(tr.created_at) = CURDATE() AND tr.access_count = 0 AND tr.sms_status = 'Sent' THEN 1 ELSE 0 END), 0) AS today_unopened,
        MIN(CASE WHEN DATE(tr.created_at) = CURDATE() THEN tr.created_at END) AS today_cron_started_at,
        MAX(CASE WHEN DATE(tr.created_at) = CURDATE() THEN tr.created_at END) AS today_cron_finished_at
      FROM ${unifiedTrackerSubquery}
    `).catch(() => [[{
      total_generated: 0, today_generated: 0, total_sent: 0, today_sent: 0,
      total_failed: 0, today_failed: 0, total_opened: 0, today_opened: 0,
      total_engaged: 0, today_engaged: 0,
      total_unopened: 0, today_unopened: 0, today_cron_started_at: null, today_cron_finished_at: null,
    }]]);

    const [[smsFilteredSummary]] = await pool.query(`
      SELECT
        COUNT(*) AS filtered_total,
        COALESCE(SUM(CASE WHEN tr.sms_status = 'Sent' THEN 1 ELSE 0 END), 0) AS filtered_sent,
        COALESCE(SUM(CASE WHEN tr.sms_status = 'Failed' THEN 1 ELSE 0 END), 0) AS filtered_failed,
        COALESCE(SUM(CASE WHEN tr.access_count > 0 THEN 1 ELSE 0 END), 0) AS filtered_opened,
        COALESCE(SUM(CASE WHEN tr.access_count = 0 AND tr.sms_status = 'Sent' THEN 1 ELSE 0 END), 0) AS filtered_unopened
      FROM ${unifiedTrackerSubquery}
      LEFT JOIN customers c ON c.id = tr.customer_id
      LEFT JOIN vehicles v ON v.id = tr.vehicle_id
      WHERE ${smsWhereSql}
    `, smsParams).catch(() => [[{
      filtered_total: 0, filtered_sent: 0, filtered_failed: 0, filtered_opened: 0, filtered_unopened: 0,
    }]]);

    const [smsReminderLogs] = await pool.query(`
      SELECT
        paged.*,
        (SELECT sh.message FROM sms_history sh
         WHERE paged.sms_status = 'Sent'
           AND sh.created_at BETWEEN DATE_SUB(paged.created_at, INTERVAL 120 SECOND) AND DATE_ADD(paged.created_at, INTERVAL 120 SECOND)
           AND sh.customer_id = paged.customer_id
         ORDER BY sh.id DESC LIMIT 1) AS sms_message_sent,
        (SELECT sh.reference_id FROM sms_history sh
         WHERE paged.sms_status = 'Sent'
           AND sh.created_at BETWEEN DATE_SUB(paged.created_at, INTERVAL 120 SECOND) AND DATE_ADD(paged.created_at, INTERVAL 120 SECOND)
           AND sh.customer_id = paged.customer_id
         ORDER BY sh.id DESC LIMIT 1) AS itexmo_ref_id,
        (SELECT sh.credits_used FROM sms_history sh
         WHERE paged.sms_status = 'Sent'
           AND sh.created_at BETWEEN DATE_SUB(paged.created_at, INTERVAL 120 SECOND) AND DATE_ADD(paged.created_at, INTERVAL 120 SECOND)
           AND sh.customer_id = paged.customer_id
         ORDER BY sh.id DESC LIMIT 1) AS sms_credits,
        (SELECT MAX(t.last_seen_at) FROM care_app_telemetry t WHERE t.customer_id = paged.customer_id) AS app_last_seen_at,
        (SELECT COALESCE(SUM(t.session_count), 0) FROM care_app_telemetry t WHERE t.customer_id = paged.customer_id) AS app_sessions,
        (SELECT COALESCE(SUM(t.api_hits), 0) FROM care_app_telemetry t WHERE t.customer_id = paged.customer_id) AS app_api_hits,
        (SELECT COUNT(*) FROM care_app_activity_logs al WHERE al.customer_id = paged.customer_id) AS activity_count,
        (SELECT br.request_id FROM booking_requests br
         WHERE br.customer_id = paged.customer_id
           AND br.time_added >= DATE_SUB(paged.created_at, INTERVAL 15 MINUTE)
         ORDER BY FIELD(br.status, 'approved', 'pending', 'negotiating', 'waitlisted', 'cancelled', 'rejected'), br.request_id DESC LIMIT 1) AS booked_request_id,
        (SELECT br.status FROM booking_requests br
         WHERE br.customer_id = paged.customer_id
           AND br.time_added >= DATE_SUB(paged.created_at, INTERVAL 15 MINUTE)
         ORDER BY FIELD(br.status, 'approved', 'pending', 'negotiating', 'waitlisted', 'cancelled', 'rejected'), br.request_id DESC LIMIT 1) AS booked_request_status,
        (SELECT br.latest_service FROM booking_requests br
         WHERE br.customer_id = paged.customer_id
           AND br.time_added >= DATE_SUB(paged.created_at, INTERVAL 15 MINUTE)
         ORDER BY FIELD(br.status, 'approved', 'pending', 'negotiating', 'waitlisted', 'cancelled', 'rejected'), br.request_id DESC LIMIT 1) AS booked_service,
        (SELECT br.booking_date FROM booking_requests br
         WHERE br.customer_id = paged.customer_id
           AND br.time_added >= DATE_SUB(paged.created_at, INTERVAL 15 MINUTE)
         ORDER BY FIELD(br.status, 'approved', 'pending', 'negotiating', 'waitlisted', 'cancelled', 'rejected'), br.request_id DESC LIMIT 1) AS booked_for_date,
        (SELECT br.time_added FROM booking_requests br
         WHERE br.customer_id = paged.customer_id
           AND br.time_added >= DATE_SUB(paged.created_at, INTERVAL 15 MINUTE)
         ORDER BY FIELD(br.status, 'approved', 'pending', 'negotiating', 'waitlisted', 'cancelled', 'rejected'), br.request_id DESC LIMIT 1) AS booked_created_at,
        (SELECT br.cancellation_reason FROM booking_requests br
         WHERE br.customer_id = paged.customer_id
           AND br.time_added >= DATE_SUB(paged.created_at, INTERVAL 15 MINUTE)
         ORDER BY FIELD(br.status, 'approved', 'pending', 'negotiating', 'waitlisted', 'cancelled', 'rejected'), br.request_id DESC LIMIT 1) AS booked_cancel_reason,
        (SELECT b2.booking_id FROM bookings b2
         WHERE b2.customer_id = paged.customer_id
           AND b2.booking_id > COALESCE(paged.booking_id, 0)
           AND b2.time_added >= DATE_SUB(paged.created_at, INTERVAL 15 MINUTE)
           AND (b2.notes IS NULL OR b2.notes NOT LIKE '%CANCELLED:%')
         ORDER BY b2.booking_id DESC LIMIT 1) AS direct_booking_id,
        (SELECT b2.booking_date FROM bookings b2
         WHERE b2.customer_id = paged.customer_id
           AND b2.booking_id > COALESCE(paged.booking_id, 0)
           AND b2.time_added >= DATE_SUB(paged.created_at, INTERVAL 15 MINUTE)
           AND (b2.notes IS NULL OR b2.notes NOT LIKE '%CANCELLED:%')
         ORDER BY b2.booking_id DESC LIMIT 1) AS direct_booking_date,
        (SELECT COALESCE(NULLIF(b2.latest_service, ''), (SELECT bst.service_name FROM bookings_service_types bst WHERE bst.booking_id = b2.booking_id ORDER BY bst.service_id ASC LIMIT 1))
         FROM bookings b2
         WHERE b2.customer_id = paged.customer_id
           AND b2.booking_id > COALESCE(paged.booking_id, 0)
           AND b2.time_added >= DATE_SUB(paged.created_at, INTERVAL 15 MINUTE)
           AND (b2.notes IS NULL OR b2.notes NOT LIKE '%CANCELLED:%')
         ORDER BY b2.booking_id DESC LIMIT 1) AS direct_booking_service,
        (SELECT b2.time_added FROM bookings b2
         WHERE b2.customer_id = paged.customer_id
           AND b2.booking_id > COALESCE(paged.booking_id, 0)
           AND b2.time_added >= DATE_SUB(paged.created_at, INTERVAL 15 MINUTE)
           AND (b2.notes IS NULL OR b2.notes NOT LIKE '%CANCELLED:%')
         ORDER BY b2.booking_id DESC LIMIT 1) AS direct_booking_created_at,
        (SELECT (SELECT bst.status FROM bookings_service_types bst WHERE bst.booking_id = b2.booking_id ORDER BY bst.service_id ASC LIMIT 1)
         FROM bookings b2
         WHERE b2.customer_id = paged.customer_id
           AND b2.booking_id > COALESCE(paged.booking_id, 0)
           AND b2.time_added >= DATE_SUB(paged.created_at, INTERVAL 15 MINUTE)
           AND (b2.notes IS NULL OR b2.notes NOT LIKE '%CANCELLED:%')
         ORDER BY b2.booking_id DESC LIMIT 1) AS direct_booking_status,
        (SELECT b2.notes FROM bookings b2
         WHERE b2.customer_id = paged.customer_id
           AND b2.booking_id > COALESCE(paged.booking_id, 0)
           AND b2.time_added >= DATE_SUB(paged.created_at, INTERVAL 15 MINUTE)
           AND (b2.notes IS NULL OR b2.notes NOT LIKE '%CANCELLED:%')
         ORDER BY b2.booking_id DESC LIMIT 1) AS direct_booking_notes,
        (SELECT s.location FROM care_magic_link_security_logs s WHERE paged.id > 0 AND s.magic_link_id = paged.id AND s.location IS NOT NULL ORDER BY s.id DESC LIMIT 1) AS bound_location,
        (SELECT s.browser_detail FROM care_magic_link_security_logs s WHERE paged.id > 0 AND s.magic_link_id = paged.id AND s.event_type IN ('first_bind', 'authorized_access') ORDER BY s.id DESC LIMIT 1) AS bound_browser,
        (SELECT s.os_detail FROM care_magic_link_security_logs s WHERE paged.id > 0 AND s.magic_link_id = paged.id AND s.event_type IN ('first_bind', 'authorized_access') ORDER BY s.id DESC LIMIT 1) AS bound_os
      FROM (
        SELECT
          tr.id,
          tr.slug,
          tr.short_url,
          tr.customer_id,
          tr.vehicle_id,
          tr.booking_id,
          tr.reminder_id,
          tr.bound_platform,
          tr.bound_user_agent,
          tr.bound_ip,
          tr.bound_at,
          tr.last_accessed_at,
          tr.access_count,
          tr.blocked_attempts,
          tr.link_status,
          tr.created_at,
          c.title AS customer_title,
          c.full_name AS customer_name,
          c.mobile_number AS customer_mobile,
          v.make AS vehicle_make,
          v.model AS vehicle_model,
          v.plate_no AS vehicle_plate,
          tr.sms_status,
          tr.template_code,
          tr.sms_log_detail
        FROM ${unifiedTrackerSubquery}
        LEFT JOIN customers c ON c.id = tr.customer_id
        LEFT JOIN vehicles v ON v.id = tr.vehicle_id
        ORDER BY CASE WHEN (${smsWhereSql}) THEN 0 ELSE 1 END ASC, ${smsOrderBySql}
        LIMIT ?
      ) AS paged
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
          today_unopened: Number(smsReminderSummary?.today_unopened || 0),
          filtered_total: Number(smsFilteredSummary?.filtered_total || 0),
          filtered_sent: Number(smsFilteredSummary?.filtered_sent || 0),
          filtered_failed: Number(smsFilteredSummary?.filtered_failed || 0),
          filtered_opened: Number(smsFilteredSummary?.filtered_opened || 0),
          filtered_unopened: Number(smsFilteredSummary?.filtered_unopened || 0),
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

// ─── GET /api/admin/customer-journey/:customerId ─────────────
// Returns chronological page & action exploration journey for a customer
router.get('/customer-journey/:customerId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const customerId = parseInt(req.params.customerId, 10);
    if (!customerId || customerId <= 0) {
      return res.status(400).json({ success: false, message: 'Valid customerId is required' });
    }

    const [[customer]] = await pool.query(
      'SELECT id, full_name, mobile_number FROM customers WHERE id = ? LIMIT 1',
      [customerId]
    );

    const [logs] = await pool.query(
      `SELECT id, customer_id, platform, event_type, page_path, page_label, action_detail, ip_address, device_label, created_at
       FROM care_app_activity_logs
       WHERE customer_id = ?
       ORDER BY created_at ASC, id ASC
       LIMIT 250`,
      [customerId]
    ).catch(() => [[]]);

    const [bookingRequests] = await pool.query(
      `SELECT br.request_id, br.booking_date, br.latest_service, br.status, br.cancellation_reason, br.time_added,
              v.make, v.model, v.plate_no
       FROM booking_requests br
       LEFT JOIN vehicles v ON v.id = br.customer_vehicle_id
       WHERE br.customer_id = ?
       ORDER BY br.time_added DESC
       LIMIT 20`,
      [customerId]
    ).catch(() => [[]]);

    const [magicLinks] = await pool.query(
      `SELECT ml.id, ml.slug, ml.short_url, ml.access_count, ml.bound_platform, ml.bound_ip, ml.bound_at, ml.last_accessed_at,
              v.make AS vehicle_make, v.model AS vehicle_model
       FROM care_magic_links ml
       LEFT JOIN vehicles v ON v.id = ml.vehicle_id
       WHERE ml.customer_id = ?
       ORDER BY ml.last_accessed_at DESC, ml.id DESC
       LIMIT 10`,
      [customerId]
    ).catch(() => [[]]);

    return res.json({
      success: true,
      data: {
        customer: customer || { id: customerId, full_name: `Customer #${customerId}`, mobile_number: '' },
        logs,
        booking_requests: bookingRequests,
        magic_links: magicLinks,
      },
    });
  } catch (err) {
    console.error('[Admin] Customer journey error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load customer journey' });
  }
});

// ─── Care Card Wallet (BoomerangMe) Installed Clients Tracker ─────────
const WALLET_TEMPLATE_META = {
  41402:   { service: 'Nano Ceramic Coating', tier: 'Silver Package',        category: 'coating', defaultVisits: 10, pointsPerVisit: 20 },
  42605:   { service: 'Nano Ceramic Coating', tier: 'Gold Package',          category: 'coating', defaultVisits: 14, pointsPerVisit: 25 },
  43203:   { service: 'Nano Ceramic Coating', tier: 'Diamond Package',       category: 'coating', defaultVisits: 24, pointsPerVisit: 25 },
  1006938: { service: 'Nano Ceramic Coating', tier: 'Diamond Package',       category: 'coating', defaultVisits: 24, pointsPerVisit: 25 },
  147644:  { service: 'Nano Ceramic Tint',    tier: 'Tint Loyalty Card',     category: 'tint',    defaultVisits: 0,  pointsPerVisit: 0  },
  318553:  { service: 'Paint Protection Film', tier: 'PPF Maintenance',      category: 'ppf',     defaultVisits: 24, pointsPerVisit: 25 },
  302979:  { service: 'Paint Protection Film', tier: 'PPF Extended Warranty', category: 'ppf',    defaultVisits: 4,  pointsPerVisit: 25 },
  40799:   { service: 'Care Wash',            tier: 'Prepaid Wash Card',     category: 'wash',    defaultVisits: 0,  pointsPerVisit: 0  },
  283699:  { service: 'MaskPro Gift',         tier: 'Gift Card',             category: 'gift',    defaultVisits: 0,  pointsPerVisit: 0  },
};

// GET /api/admin/wallet-cards
router.get('/wallet-cards', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(5, parseInt(req.query.limit, 10) || 10));
    const offset = (page - 1) * limit;
    const filter = String(req.query.filter || 'all_installed').trim();
    const tierFilter = String(req.query.tier || 'all').trim();
    const branchFilter = String(req.query.branch || 'all').trim();
    const search = String(req.query.search || '').trim();
    const sort = String(req.query.sort || 'recent_installed').trim();

    // 1. Summary KPIs from care_wallet_cards_cache joined with loyalty_cards (active Unify cards)
    // NOTE: Only 'Apple Wallet' and 'Google Pay' are true native wallet installs verified via Apple PassKit / Google Wallet callbacks.
    // 'PWA' means the client scanned the QR / submitted the BoomerangMe form and viewed the web pass in the browser without installing a native wallet.
    const [[summaryRow]] = await pool.query(`
      SELECT
        COUNT(*) AS total_active_cards,
        SUM(CASE WHEN w.status = 'installed' AND w.device IN ('Apple Wallet', 'Google Pay') THEN 1 ELSE 0 END) AS total_installed,
        SUM(CASE WHEN w.status = 'installed' AND w.device = 'Apple Wallet' THEN 1 ELSE 0 END) AS apple_wallet_count,
        SUM(CASE WHEN w.status = 'installed' AND w.device = 'Google Pay' THEN 1 ELSE 0 END) AS google_pay_count,
        SUM(CASE WHEN w.status = 'installed' AND w.device = 'PWA' THEN 1 ELSE 0 END) AS pwa_wallet_count,
        SUM(CASE WHEN w.status = 'installed' AND w.device IN ('Google Pay', 'PWA') THEN 1 ELSE 0 END) AS android_web_count,
        SUM(CASE WHEN w.status = 'not_installed' THEN 1 ELSE 0 END) AS not_installed_count,
        SUM(CASE WHEN w.status = 'installed' AND w.device IN ('Apple Wallet', 'Google Pay') AND w.template_id IN (41402, 42605, 43203, 1006938) THEN 1 ELSE 0 END) AS coating_installed_count,
        SUM(CASE WHEN w.status = 'installed' AND w.device IN ('Apple Wallet', 'Google Pay') AND w.template_id = 147644 THEN 1 ELSE 0 END) AS tint_installed_count,
        SUM(CASE WHEN w.status = 'installed' AND w.device IN ('Apple Wallet', 'Google Pay') AND w.template_id IN (318553, 302979) THEN 1 ELSE 0 END) AS ppf_installed_count,
        COUNT(DISTINCT CASE WHEN w.status = 'installed' AND w.device IN ('Apple Wallet', 'Google Pay') THEN COALESCE(CAST(b.customer_id AS CHAR), w.bm_customer_id, w.card_no) END) AS unique_installed_clients,
        MAX(w.synced_at) AS last_synced_at
      FROM care_wallet_cards_cache w
      INNER JOIN loyalty_cards lc ON lc.card_no = w.card_no
      LEFT JOIN bookings b ON b.booking_id = lc.booking_id
      WHERE w.status != 'deleted'
    `);

    // 2. Build WHERE conditions
    const whereParts = ["w.status != 'deleted'"];
    const params = [];

    if (filter === 'all_installed') {
      whereParts.push("w.status = 'installed' AND w.device IN ('Apple Wallet', 'Google Pay')");
    } else if (filter === 'apple') {
      whereParts.push("w.status = 'installed' AND w.device = 'Apple Wallet'");
    } else if (filter === 'android_all') {
      whereParts.push("w.status = 'installed' AND w.device IN ('Google Pay', 'PWA')");
    } else if (filter === 'google_pay') {
      whereParts.push("w.status = 'installed' AND w.device = 'Google Pay'");
    } else if (filter === 'pwa') {
      whereParts.push("w.status = 'installed' AND w.device = 'PWA'");
    } else if (filter === 'not_installed') {
      whereParts.push("w.status = 'not_installed'");
    }

    if (tierFilter === 'coating') {
      whereParts.push('w.template_id IN (41402, 42605, 43203, 1006938)');
    } else if (tierFilter === 'diamond') {
      whereParts.push('w.template_id IN (43203, 1006938)');
    } else if (tierFilter === 'gold') {
      whereParts.push('w.template_id = 42605');
    } else if (tierFilter === 'silver') {
      whereParts.push('w.template_id = 41402');
    } else if (tierFilter === 'tint') {
      whereParts.push('w.template_id = 147644');
    } else if (tierFilter === 'ppf') {
      whereParts.push('w.template_id IN (318553, 302979)');
    }

    if (branchFilter && branchFilter !== 'all') {
      whereParts.push('(w.bm_branch LIKE ? OR br.branch_name LIKE ?)');
      params.push(`%${branchFilter}%`, `%${branchFilter}%`);
    }

    if (search) {
      const like = `%${search.replace(/^#/, '')}%`;
      whereParts.push(`(
        c.full_name LIKE ?
        OR c.mobile_number LIKE ?
        OR CONCAT(w.bm_first_name, ' ', w.bm_last_name) LIKE ?
        OR w.card_no LIKE ?
        OR w.bm_vehicle LIKE ?
        OR v.make LIKE ?
        OR v.model LIKE ?
        OR v.plate_no LIKE ?
        OR w.bm_branch LIKE ?
        OR CAST(b.customer_id AS CHAR) LIKE ?
        OR CAST(lc.booking_id AS CHAR) LIKE ?
      )`);
      params.push(like, like, like, like, like, like, like, like, like, like, like);
    }

    const whereSql = whereParts.join(' AND ');

    let orderBySql = 'COALESCE(w.bm_updated_at, w.bm_created_at, lc.created_date) DESC, lc.lc_id DESC';
    if (sort === 'newest_issued') {
      orderBySql = 'COALESCE(w.bm_created_at, lc.created_date) DESC, lc.lc_id DESC';
    } else if (sort === 'most_visits_used') {
      orderBySql = `(
        CASE
          WHEN w.template_id IN (43203, 1006938, 318553) THEN GREATEST(0, 24 - COALESCE(w.visits_remaining, 24))
          WHEN w.template_id = 42605 THEN GREATEST(0, 14 - COALESCE(w.visits_remaining, 14))
          WHEN w.template_id = 41402 THEN GREATEST(0, 10 - COALESCE(w.visits_remaining, 10))
          WHEN w.template_id = 302979 THEN GREATEST(0, 4 - COALESCE(w.visits_remaining, 4))
          ELSE 0
        END
      ) DESC, COALESCE(w.bm_updated_at, w.bm_created_at) DESC`;
    } else if (sort === 'customer_az') {
      orderBySql = "COALESCE(NULLIF(TRIM(c.full_name), ''), CONCAT(w.bm_first_name, ' ', w.bm_last_name), 'ZZZZ') ASC";
    } else if (sort === 'bonus_points') {
      orderBySql = 'COALESCE(w.bonus_balance, 0) DESC, COALESCE(w.bm_updated_at, w.bm_created_at) DESC';
    }

    const [[countRow]] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM care_wallet_cards_cache w
       INNER JOIN loyalty_cards lc ON lc.card_no = w.card_no
       LEFT JOIN bookings b ON b.booking_id = lc.booking_id
       LEFT JOIN branches br ON br.id = b.branch_id
       LEFT JOIN customers c ON c.id = b.customer_id
       LEFT JOIN vehicles v ON v.id = b.customer_vehicle_id
       WHERE ${whereSql}`,
      params
    );

    const [rows] = await pool.query(
      `SELECT
         w.card_no,
         w.template_id,
         w.card_type,
         w.status,
         w.device,
         w.bm_first_name,
         w.bm_last_name,
         w.bm_email,
         w.bm_phone,
         w.bm_vehicle,
         w.bm_branch,
         w.visits_remaining,
         w.stamps_total,
         w.bonus_balance,
         w.discount_pct,
         w.discount_amount,
         w.count_visits,
         w.last_stamp_at,
         COALESCE(lc.card_install_link, w.install_link) AS install_link,
         lc.joturl_shortlink,
         COALESCE(lc.joturl_qrlink, w.qr_link) AS qr_link,
         w.apple_install_link,
         w.google_install_link,
         w.pwa_install_link,
         COALESCE(w.bm_created_at, lc.created_date) AS issued_at,
         w.bm_updated_at AS updated_at,
         COALESCE(w.bm_expires_at, lc.expiration_date) AS expires_at,
         lc.lc_id,
         lc.booking_id,
         b.customer_id,
         b.customer_vehicle_id,
         b.booking_date,
         COALESCE(br.branch_name, w.bm_branch, 'Davao') AS branch_name,
         COALESCE(NULLIF(TRIM(c.full_name), ''), TRIM(CONCAT(COALESCE(w.bm_first_name, ''), ' ', COALESCE(w.bm_last_name, ''))), 'Valued Client') AS customer_name,
         COALESCE(NULLIF(TRIM(c.mobile_number), ''), w.bm_phone, '') AS customer_mobile,
         v.make AS vehicle_make,
         v.model AS vehicle_model,
         v.plate_no AS vehicle_plate,
         (SELECT COALESCE(SUM(t.session_count), 0) FROM care_app_telemetry t WHERE t.customer_id = b.customer_id) AS app_sessions,
         (SELECT MAX(t.last_seen_at) FROM care_app_telemetry t WHERE t.customer_id = b.customer_id) AS app_last_seen_at,
         (SELECT COUNT(*) FROM care_app_activity_logs al WHERE al.customer_id = b.customer_id) AS activity_count
       FROM care_wallet_cards_cache w
       INNER JOIN loyalty_cards lc ON lc.card_no = w.card_no
       LEFT JOIN bookings b ON b.booking_id = lc.booking_id
       LEFT JOIN branches br ON br.id = b.branch_id
       LEFT JOIN customers c ON c.id = b.customer_id
       LEFT JOIN vehicles v ON v.id = b.customer_vehicle_id
       WHERE ${whereSql}
       ORDER BY ${orderBySql}
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const formattedRows = rows.map((r) => {
      const meta = WALLET_TEMPLATE_META[r.template_id] || {
        service: 'MaskPro Care Card',
        tier: 'Loyalty Card',
        category: 'other',
        defaultVisits: 0,
        pointsPerVisit: 0,
      };
      const defaultTotal = meta.defaultVisits || 0;
      const remaining = r.visits_remaining !== null && r.visits_remaining !== undefined ? Number(r.visits_remaining) : null;
      const isUninitialized = remaining === 0 && r.stamps_total === null && defaultTotal > 0;
      const visitsTotal = defaultTotal > 0 ? Math.max(defaultTotal, remaining || 0) : (remaining || 0);
      const visitsUsed = isUninitialized ? 0 : (visitsTotal > 0 && remaining !== null ? Math.max(0, visitsTotal - remaining) : 0);

      let expiresAt = r.expires_at;
      if (!expiresAt && Number(r.template_id) === 1006938 && r.issued_at) {
        const d = new Date(r.issued_at);
        if (!isNaN(d.getTime())) {
          d.setFullYear(d.getFullYear() + 12);
          expiresAt = d.toISOString();
        }
      }

      const unifyVehicle = [r.vehicle_make, r.vehicle_model].filter(Boolean).join(' ').trim();
      const validPlate = r.vehicle_plate && !/^(to follow|no plate|for registration|none|n\/a|-|\.|tba|new)$/i.test(String(r.vehicle_plate).trim())
        ? String(r.vehicle_plate).trim()
        : '';

      return {
        ...r,
        service_name: meta.service,
        tier_name: meta.tier,
        category: meta.category,
        visits_total: visitsTotal,
        visits_used: visitsUsed,
        visits_remaining: remaining,
        expires_at_resolved: expiresAt,
        vehicle_display: unifyVehicle || r.bm_vehicle || 'Vehicle',
        plate_display: validPlate,
      };
    });

    const totalActive = Number(summaryRow?.total_active_cards || 0);
    const totalInstalled = Number(summaryRow?.total_installed || 0);

    return res.json({
      success: true,
      data: {
        summary: {
          total_active_cards: totalActive,
          total_installed: totalInstalled,
          install_rate_pct: totalActive > 0 ? Number(((totalInstalled / totalActive) * 100).toFixed(1)) : 0,
          apple_wallet_count: Number(summaryRow?.apple_wallet_count || 0),
          google_pay_count: Number(summaryRow?.google_pay_count || 0),
          pwa_wallet_count: Number(summaryRow?.pwa_wallet_count || 0),
          android_web_count: Number(summaryRow?.android_web_count || 0),
          not_installed_count: Number(summaryRow?.not_installed_count || 0),
          coating_installed_count: Number(summaryRow?.coating_installed_count || 0),
          tint_installed_count: Number(summaryRow?.tint_installed_count || 0),
          ppf_installed_count: Number(summaryRow?.ppf_installed_count || 0),
          unique_installed_clients: Number(summaryRow?.unique_installed_clients || 0),
          last_synced_at: summaryRow?.last_synced_at || null,
        },
        cards: formattedRows,
        pagination: {
          page,
          limit,
          total: Number(countRow?.total || 0),
          totalPages: Math.max(1, Math.ceil(Number(countRow?.total || 0) / limit)),
        },
      },
    });
  } catch (err) {
    console.error('[Admin] Wallet cards error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load wallet cards' });
  }
});

// Reusable BoomerangMe wallet sync helper (used by both auto-cron every 15m and manual POST /wallet-cards/sync)
let isWalletSyncRunning = false;
async function syncWalletCardsFromBoomerangMe(maxPages = 2) {
  if (isWalletSyncRunning) return 0;
  isWalletSyncRunning = true;
  let totalSynced = 0;
  try {
    const apiKey = process.env.BOOMERANGME_API_KEY;
    if (!apiKey) {
      console.warn('[Admin] BOOMERANGME_API_KEY not set in .env — skipping wallet sync');
      return 0;
    }
    const toMysqlDt = (iso) => {
      if (!iso) return null;
      const d = new Date(iso);
      return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 19).replace('T', ' ');
    };

    for (let p = 1; p <= maxPages; p += 1) {
      const resp = await fetch(`https://api.digitalwallet.cards/api/v2/cards?itemsPerPage=1000&page=${p}`, {
        headers: { 'X-API-Key': apiKey },
      });
      if (!resp.ok) break;
      const json = await resp.json();
      const items = json?.data || [];
      if (items.length === 0) break;

      const values = items.map((c) => {
        let fn = c.customer?.firstName || '';
        let ln = c.customer?.surname || '';
        let em = c.customer?.email || '';
        let veh = '';
        let br = '';
        for (const f of c.customFields || []) {
          if (f.type === 'FName' && f.value) fn = f.value;
          if (f.type === 'SName' && f.value) ln = f.value;
          if (f.type === 'email' && f.value) em = f.value;
          const nm = (f.name || '').toLowerCase();
          if (nm.includes('vehicle') || nm.includes('plate')) veh = f.value || '';
          if (nm.includes('branch')) br = f.value || '';
        }
        const bal = c.balance || {};
        const dl = c.directInstallLink || {};
        return [
          c.id,
          c.templateId || null,
          c.type || null,
          c.status || 'not_installed',
          c.device || null,
          c.customerId || c.customer?.id || null,
          fn || null,
          ln || null,
          em || null,
          c.customer?.phone || null,
          veh || null,
          br || null,
          bal.currentNumberOfUses ?? null,
          bal.numberStampsTotal ?? null,
          bal.bonusBalance ?? null,
          bal.discountPercentage ?? null,
          bal.discountAmount ?? null,
          c.countVisits ?? null,
          toMysqlDt(c.lastStampEarnedAt),
          c.installLink || null,
          c.shareLink || null,
          c.qrLink || null,
          dl.apple || null,
          dl.google || null,
          dl.pwa || null,
          toMysqlDt(c.createdAt),
          toMysqlDt(c.updatedAt),
          toMysqlDt(c.expiresAt),
        ];
      });

      const chunkSize = 200;
      for (let i = 0; i < values.length; i += chunkSize) {
        const chunk = values.slice(i, i + chunkSize);
        await pool.query(
          `INSERT INTO care_wallet_cards_cache (
             card_no, template_id, card_type, status, device, bm_customer_id,
             bm_first_name, bm_last_name, bm_email, bm_phone, bm_vehicle, bm_branch,
             visits_remaining, stamps_total, bonus_balance, discount_pct, discount_amount,
             count_visits, last_stamp_at, install_link, share_link, qr_link,
             apple_install_link, google_install_link, pwa_install_link,
             bm_created_at, bm_updated_at, bm_expires_at, synced_at
           ) VALUES ?
           ON DUPLICATE KEY UPDATE
             template_id = VALUES(template_id),
             card_type = VALUES(card_type),
             status = VALUES(status),
             device = VALUES(device),
             bm_customer_id = VALUES(bm_customer_id),
             bm_first_name = VALUES(bm_first_name),
             bm_last_name = VALUES(bm_last_name),
             bm_email = VALUES(bm_email),
             bm_phone = VALUES(bm_phone),
             bm_vehicle = VALUES(bm_vehicle),
             bm_branch = VALUES(bm_branch),
             visits_remaining = VALUES(visits_remaining),
             stamps_total = VALUES(stamps_total),
             bonus_balance = VALUES(bonus_balance),
             discount_pct = VALUES(discount_pct),
             discount_amount = VALUES(discount_amount),
             count_visits = VALUES(count_visits),
             last_stamp_at = VALUES(last_stamp_at),
             install_link = VALUES(install_link),
             share_link = VALUES(share_link),
             qr_link = VALUES(qr_link),
             apple_install_link = VALUES(apple_install_link),
             google_install_link = VALUES(google_install_link),
             pwa_install_link = VALUES(pwa_install_link),
             bm_created_at = VALUES(bm_created_at),
             bm_updated_at = VALUES(bm_updated_at),
             bm_expires_at = VALUES(bm_expires_at),
             synced_at = NOW()`,
          [chunk.map((r) => [...r, new Date()])]
        );
      }

      totalSynced += items.length;
      if (items.length < 1000) break;
    }
  } catch (err) {
    console.error('[Admin] Auto wallet sync error:', err.message);
  } finally {
    isWalletSyncRunning = false;
  }
  return totalSynced;
}

// Automatic background cron: sync BoomerangMe wallet cards every 15 minutes
setInterval(() => {
  syncWalletCardsFromBoomerangMe(2).catch(() => {});
}, 15 * 60 * 1000);

// POST /api/admin/wallet-cards/sync — Manual on-demand sync
router.post('/wallet-cards/sync', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const maxPages = req.body?.full ? 10 : 2;
    const totalSynced = await syncWalletCardsFromBoomerangMe(maxPages);
    return res.json({
      success: true,
      message: `Synced ${totalSynced.toLocaleString()} cards from BoomerangMe`,
      data: { totalSynced },
    });
  } catch (err) {
    console.error('[Admin] Wallet sync error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to sync wallet cards from BoomerangMe' });
  }
});

module.exports = router;
