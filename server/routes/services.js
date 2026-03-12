/**
 * Services Routes — List
 * 
 * GET /api/services/list — Available service types (conditionally includes NanoFix)
 */

const express = require('express');
const router = express.Router();

const pool = require('../db/connection');
const { authenticateToken } = require('../middleware/auth');

router.use(authenticateToken);

// Core services — always shown
const CORE_SERVICES = [
  { api_name: 'Nano Ceramic Coating',   label: 'Nano Ceramic Coating',       category: 'Protection' },
  { api_name: 'Nano Ceramic Tint',      label: 'Nano Ceramic Tint',          category: 'Protection' },
  { api_name: 'PPF',                    label: 'Paint Protection Film (PPF)', category: 'Protection' },
  { api_name: 'Auto Paint & Repair',    label: 'Auto Paint & Repair',        category: 'Repair' },
  { api_name: 'Go & Clean',             label: 'Detailing',                  category: 'Detailing' }
];

// ─── GET /api/services/list ───────────────────────────────────────
router.get('/list', async (req, res) => {
  try {
    const customerId = req.user.customer_id;
    let hasMncc = false;

    // Check if customer has existing MNCC booking
    try {
      const [rows] = await pool.query(`
        SELECT COUNT(*) as cnt FROM bookings
        WHERE customer_id = ?
        AND (latest_service = 'Nano Ceramic Coating' OR latest_service = 'MNCC')
        AND (notes IS NULL OR notes NOT LIKE '%CANCELLED:%')
      `, [customerId]);
      hasMncc = (rows[0]?.cnt || 0) > 0;
    } catch { /* ignore */ }

    // If first query found nothing, also check bookings_service_types
    if (!hasMncc) {
      try {
        const [rows] = await pool.query(`
          SELECT COUNT(*) as cnt FROM bookings b
          JOIN bookings_service_types bst ON b.booking_id = bst.booking_id
          WHERE b.customer_id = ?
          AND bst.service_name = 'Nano Ceramic Coating'
          AND (b.notes IS NULL OR b.notes NOT LIKE '%CANCELLED:%')
        `, [customerId]);
        hasMncc = (rows[0]?.cnt || 0) > 0;
      } catch { /* ignore */ }
    }

    // Build final service list
    const services = [...CORE_SERVICES];

    // Prepend Maintenance (NanoFix) if customer has MNCC
    if (hasMncc) {
      services.unshift({
        api_name: 'Nano Fix (Maintenance)',
        label: 'Maintenance (NanoFix)',
        category: 'Maintenance'
      });
    }

    return res.json({
      success: true,
      data: { service_types: services, has_mncc: hasMncc },
      message: 'Service types retrieved',
      errors: []
    });
  } catch (err) {
    console.error('Services list error:', err);
    return res.status(500).json({ success: false, data: null, message: 'Failed to load services', errors: [] });
  }
});

module.exports = router;
