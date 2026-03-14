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
       JOIN customers c ON LOWER(TRIM(u.full_name)) = LOWER(TRIM(c.full_name))
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
      'SELECT id, full_name, mobile_number, branch_id FROM customers WHERE id = ?',
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
    const passwordHash = adminUser.password.replace(/^\$2y\$/, '$2a$');
    const isValid = await bcrypt.compare(password, passwordHash);
    if (!isValid) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    // Find a matching customer record (by full_name or mobile) — needed for JWT sub
    let customerId = null;
    let customerMobile = adminUser.mobile_number;

    const [byName] = await pool.query(
      "SELECT id, mobile_number FROM customers WHERE LOWER(TRIM(full_name)) = LOWER(TRIM(?)) LIMIT 1",
      [adminUser.full_name]
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

    console.log(`[Admin] Admin login: ${adminUser.full_name} (user ID: ${adminUser.id})`);

    return res.json({
      success: true,
      data: {
        token,
        customer: {
          id: customerId || 0,
          full_name: adminUser.full_name,
          mobile_number: customerMobile,
          branch_id: 1,
        },
        isAdmin: true,
        adminName: adminUser.full_name,
      },
      message: `Welcome, ${adminUser.full_name}!`,
    });
  } catch (err) {
    console.error('[Admin] Login error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
