/**
 * Profile Routes — Get, Update
 * 
 * GET  /api/profile/get    — Get profile + stats
 * POST /api/profile/update — Update profile (also PUT)
 */

const express = require('express');
const router = express.Router();

const pool = require('../db/connection');
const { authenticateToken } = require('../middleware/auth');

router.use(authenticateToken);

// --- Helper: Get customer stats ---
async function getCustomerStats(customerId) {
  const stats = { total_vehicles: 0, total_bookings: 0, completed_services: 0, vehicles_needing_service: 0 };
  try {
    const [v] = await pool.query("SELECT COUNT(*) as total FROM vehicles WHERE customer_id = ?", [customerId]);
    stats.total_vehicles = v[0]?.total || 0;

    const [b] = await pool.query("SELECT COUNT(*) as total FROM bookings WHERE customer_id = ?", [customerId]);
    stats.total_bookings = b[0]?.total || 0;

    const [c] = await pool.query("SELECT COUNT(*) as total FROM bookings WHERE customer_id = ? AND booking_date < NOW() AND (notes IS NULL OR notes NOT LIKE '%CANCELLED:%')", [customerId]);
    stats.completed_services = c[0]?.total || 0;
  } catch { /* ignore */ }
  return stats;
}

// ─── GET /api/profile/get ─────────────────────────────────────────
router.get('/get', async (req, res) => {
  try {
    const [customers] = await pool.query("SELECT * FROM customers WHERE id = ?", [req.user.customer_id]);
    if (customers.length === 0) {
      return res.status(404).json({ success: false, data: null, message: 'Customer not found', errors: [] });
    }

    const stats = await getCustomerStats(req.user.customer_id);

    return res.json({ success: true, data: { customer: customers[0], stats }, message: 'Profile retrieved', errors: [] });
  } catch (err) {
    console.error('Profile get error:', err);
    return res.status(500).json({ success: false, data: null, message: 'Failed to load profile', errors: [] });
  }
});

// ─── POST|PUT /api/profile/update ─────────────────────────────────
router.post('/update', handleProfileUpdate);
router.put('/update', handleProfileUpdate);

async function handleProfileUpdate(req, res) {
  try {
    const [customers] = await pool.query("SELECT * FROM customers WHERE id = ?", [req.user.customer_id]);
    if (customers.length === 0) {
      return res.status(404).json({ success: false, data: null, message: 'Customer not found', errors: [] });
    }

    const customer = customers[0];
    const fullName = String(req.body.full_name ?? customer.full_name ?? '').trim();
    const email = String(req.body.email ?? customer.email ?? '').trim();
    const address = String(req.body.address ?? customer.address ?? '').trim();

    // Validate email if provided
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(422).json({ success: false, data: null, message: 'Invalid email address', errors: [] });
    }

    await pool.query("UPDATE customers SET full_name = ?, email = ?, address = ? WHERE id = ?", [fullName, email, address, req.user.customer_id]);

    const [updated] = await pool.query("SELECT * FROM customers WHERE id = ?", [req.user.customer_id]);
    return res.json({ success: true, data: { customer: updated[0] }, message: 'Profile updated successfully', errors: [] });
  } catch (err) {
    console.error('Profile update error:', err);
    return res.status(500).json({ success: false, data: null, message: 'Failed to update profile', errors: [] });
  }
}

module.exports = router;
